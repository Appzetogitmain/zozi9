/**
 * Refer & Earn.
 *
 *  - Every customer gets a shareable code (created lazily).
 *  - A new customer enters a code at signup (or later, before their first order).
 *    That creates a pending Referral.
 *  - When the new customer's first qualifying order is delivered, both sides get the
 *    reward the admin configured: wallet cash or a one-time checkout coupon
 *    (a CustomerReward with source "referral", redeemed like Spin & Win rewards).
 */
import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/customer.js";
import Order from "../models/order.js";
import Transaction from "../models/transaction.js";
import CustomerReward from "../models/customerReward.js";
import RewardLedger from "../models/rewardLedger.js";
import Referral, { REFERRAL_STATUS } from "../models/referral.js";
import ReferralSettings from "../models/referralSettings.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I look-alikes
const DAY_MS = 24 * 60 * 60 * 1000;

export class ReferralError extends Error {
  constructor(statusCode, message, code = "REFERRAL_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

function randomCode(length) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function normalizeReferralCode(raw) {
  return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export async function getReferralSettings() {
  return ReferralSettings.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
}

/** Short human text for a reward config, e.g. "₹50 wallet cash" or "10% off (up to ₹100)" */
export function describeReward(config = {}) {
  const value = Number(config.value || 0);
  switch (config.type) {
    case "wallet":
      return value > 0 ? `₹${value} wallet cash` : "";
    case "fixed":
      return value > 0 ? `₹${value} off coupon` : "";
    case "percentage": {
      if (!(value > 0)) return "";
      const cap = config.maxDiscount != null && Number(config.maxDiscount) > 0 ? ` (up to ₹${Number(config.maxDiscount)})` : "";
      return `${value}% off coupon${cap}`;
    }
    case "free_delivery":
      return "Free delivery coupon";
    default:
      return "";
  }
}

function hasReward(config = {}) {
  return config.type === "free_delivery" || Number(config.value || 0) > 0;
}

function publicRewardView(config = {}) {
  return {
    type: config.type,
    value: Number(config.value || 0),
    maxDiscount: config.maxDiscount ?? null,
    minCartValue: Number(config.minCartValue || 0),
    validityDays: Number(config.validityDays || 0),
    label: describeReward(config),
  };
}

/** What customers may see about the programme (no internal limits) */
export function toPublicProgram(settings) {
  return {
    enabled: !!settings.enabled,
    referrerReward: publicRewardView(settings.referrerReward),
    refereeReward: publicRewardView(settings.refereeReward),
    minOrderValue: Number(settings.minOrderValue || 0),
  };
}

/* ------------------------------------------------------------------ */
/* Codes                                                               */
/* ------------------------------------------------------------------ */

/** Returns the customer's referral code, creating one on first use. */
export async function ensureReferralCode(customerId) {
  const existing = await User.findById(customerId).select("referralCode").lean();
  if (!existing) throw new ReferralError(404, "Customer not found", "NOT_FOUND");
  if (existing.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomCode(8);
    try {
      const updated = await User.findOneAndUpdate(
        { _id: customerId, referralCode: { $in: [null, ""] } },
        { $set: { referralCode: code } },
        { new: true },
      )
        .select("referralCode")
        .lean();
      if (updated?.referralCode) return updated.referralCode;
      // another request set it first
      const again = await User.findById(customerId).select("referralCode").lean();
      if (again?.referralCode) return again.referralCode;
    } catch (error) {
      if (error?.code !== 11000) throw error; // code collision -> try another
    }
  }
  throw new ReferralError(500, "Could not create a referral code. Please try again.", "CODE_FAILED");
}

async function hasPlacedOrder(customerId) {
  return !!(await Order.exists({ customer: customerId, status: { $ne: "cancelled" } }));
}

/**
 * Links a customer to the owner of `code`. Allowed once, only before the customer's
 * first order, and never with their own code.
 */
export async function applyReferralCode({ customerId, code }) {
  const normalized = normalizeReferralCode(code);
  if (!normalized) throw new ReferralError(400, "Enter a referral code", "CODE_REQUIRED");

  const settings = await getReferralSettings();
  if (!settings.enabled) throw new ReferralError(403, "Refer & Earn is not available right now", "DISABLED");

  const [customer, referrer] = await Promise.all([
    User.findById(customerId).select("_id referredBy referralCode").lean(),
    User.findOne({ referralCode: normalized }).select("_id isActive").lean(),
  ]);
  if (!customer) throw new ReferralError(404, "Customer not found", "NOT_FOUND");
  if (!referrer || referrer.isActive === false) {
    throw new ReferralError(404, "This referral code is not valid", "INVALID_CODE");
  }
  if (String(referrer._id) === String(customer._id)) {
    throw new ReferralError(400, "You cannot use your own referral code", "SELF_REFERRAL");
  }
  if (customer.referredBy) {
    throw new ReferralError(409, "A referral code has already been applied to your account", "ALREADY_REFERRED");
  }
  if (await hasPlacedOrder(customer._id)) {
    throw new ReferralError(400, "Referral codes can only be used before your first order", "HAS_ORDERS");
  }

  try {
    await Referral.create({ referrer: referrer._id, referee: customer._id, code: normalized });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ReferralError(409, "A referral code has already been applied to your account", "ALREADY_REFERRED");
    }
    throw error;
  }
  await User.updateOne({ _id: customer._id, referredBy: null }, { $set: { referredBy: referrer._id } });

  return {
    applied: true,
    message: hasReward(settings.refereeReward)
      ? `Referral code applied! You will get ${describeReward(settings.refereeReward)} after your first order is delivered.`
      : "Referral code applied!",
  };
}

/* ------------------------------------------------------------------ */
/* Rewards                                                             */
/* ------------------------------------------------------------------ */

async function issueReward({ customerId, config, referral, role, session }) {
  if (!hasReward(config)) return { outcome: "none", type: config.type || "", value: 0 };

  const value = round2(config.value);
  const now = new Date();

  if (config.type === "wallet") {
    await User.updateOne({ _id: customerId }, { $inc: { walletBalance: value } }, { session });
    await Transaction.create(
      [
        {
          user: customerId,
          userModel: "User",
          type: "Bonus",
          amount: value,
          status: "Settled",
          reference: `REF-BONUS-${referral._id}-${role}`,
          meta: { source: "referral", referralId: String(referral._id), role },
        },
      ],
      { session },
    );
    return { outcome: "issued", type: "wallet", value };
  }

  const label = role === "referrer"
    ? `Referral reward: ${describeReward(config)}`
    : `Welcome reward: ${describeReward(config)}`;
  const [reward] = await CustomerReward.create(
    [
      {
        source: "referral",
        referralId: referral._id,
        customerId,
        attemptId: new mongoose.Types.ObjectId(),
        code: `REF-${randomCode(8)}`,
        snapshot: {
          label,
          type: config.type,
          value: config.type === "free_delivery" ? 0 : value,
          minCartValue: Number(config.minCartValue || 0),
          maxDiscount: config.type === "percentage" && config.maxDiscount != null ? Number(config.maxDiscount) : null,
          fundedBy: "company",
        },
        status: "available",
        expiresAt: new Date(now.getTime() + Math.max(1, Number(config.validityDays || 30)) * DAY_MS),
      },
    ],
    { session },
  );
  await RewardLedger.create(
    [
      {
        entryType: "issued",
        source: "referral",
        customerRewardId: reward._id,
        customerId,
        amount: 0,
        meta: { referralId: String(referral._id), role, type: config.type, value },
      },
    ],
    { session },
  );
  return { outcome: "issued", type: config.type, value, customerRewardId: reward._id, code: reward.code };
}

async function qualifyingOrderValue(order) {
  const own = Number(order.pricing?.subtotal ?? order.pricingSnapshot?.productSubtotal ?? 0);
  if (!order.checkoutGroupId) return own;

  // One checkout can be split into several seller orders; judge the whole basket
  const siblings = await Order.find({
    checkoutGroupId: order.checkoutGroupId,
    customer: order.customer,
    status: { $ne: "cancelled" },
  })
    .select("pricing.subtotal pricingSnapshot.productSubtotal")
    .lean();
  if (siblings.length === 0) return own;
  return siblings.reduce(
    (sum, o) => sum + Number(o.pricing?.subtotal ?? o.pricingSnapshot?.productSubtotal ?? 0),
    0,
  );
}

/**
 * Called after an order is marked delivered. Completes the customer's pending referral
 * (if any) and issues both rewards. Idempotent and never throws into the delivery flow.
 */
export async function processDeliveredOrderForReferral(orderOrId) {
  try {
    const order = orderOrId?._id && orderOrId?.customer
      ? orderOrId
      : await Order.findById(orderOrId).lean();
    if (!order?.customer || order.status !== "delivered") return { completed: false, reason: "not_delivered" };

    const pending = await Referral.findOne({ referee: order.customer, status: REFERRAL_STATUS.PENDING }).lean();
    if (!pending) return { completed: false, reason: "no_pending_referral" };

    const settings = await getReferralSettings();
    if (!settings.enabled) return { completed: false, reason: "disabled" };

    const minOrderValue = Number(settings.minOrderValue || 0);
    if (minOrderValue > 0 && (await qualifyingOrderValue(order)) < minOrderValue) {
      return { completed: false, reason: "below_min_order_value" };
    }

    const session = await mongoose.startSession();
    try {
      let result = { completed: false, reason: "already_completed" };
      await session.withTransaction(async () => {
        const referral = await Referral.findOneAndUpdate(
          { _id: pending._id, status: REFERRAL_STATUS.PENDING },
          { $set: { status: REFERRAL_STATUS.COMPLETED, completedAt: new Date(), qualifyingOrderId: order._id } },
          { new: true, session },
        );
        if (!referral) return; // another delivery completed it first

        const maxPerUser = Number(settings.maxReferralsPerUser || 0);
        const referrerRewarded = maxPerUser > 0
          ? await Referral.countDocuments({
              referrer: referral.referrer,
              status: REFERRAL_STATUS.COMPLETED,
              "referrerReward.outcome": "issued",
            }).session(session)
          : 0;

        referral.refereeReward = await issueReward({
          customerId: referral.referee,
          config: settings.refereeReward,
          referral,
          role: "referee",
          session,
        });
        referral.referrerReward = maxPerUser > 0 && referrerRewarded >= maxPerUser
          ? { outcome: "skipped_limit", type: settings.referrerReward?.type || "", value: 0 }
          : await issueReward({
              customerId: referral.referrer,
              config: settings.referrerReward,
              referral,
              role: "referrer",
              session,
            });
        await referral.save({ session });
        result = { completed: true, referralId: String(referral._id) };
      });
      return result;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.warn("[referral] processDeliveredOrderForReferral failed:", error.message);
    return { completed: false, reason: "error" };
  }
}

/* ------------------------------------------------------------------ */
/* Customer views                                                      */
/* ------------------------------------------------------------------ */

function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 4 ? `•••••${digits.slice(-4)}` : "";
}

function friendName(user) {
  const first = String(user?.name || "").trim().split(/\s+/)[0];
  return first && first !== "Customer" ? first : "Your friend";
}

export async function getMyReferralSummary(customerId) {
  const settings = await getReferralSettings();
  const [code, me, referrals] = await Promise.all([
    ensureReferralCode(customerId),
    User.findById(customerId).select("referredBy").lean(),
    Referral.find({ referrer: customerId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("referee", "name phone")
      .lean(),
  ]);

  let walletEarned = 0;
  let couponsEarned = 0;
  for (const r of referrals) {
    if (r.referrerReward?.outcome !== "issued") continue;
    if (r.referrerReward.type === "wallet") walletEarned += Number(r.referrerReward.value || 0);
    else couponsEarned += 1;
  }

  const canApplyCode = !!settings.enabled && !me?.referredBy && !(await hasPlacedOrder(customerId));

  return {
    program: toPublicProgram(settings),
    code,
    canApplyCode,
    referredBy: !!me?.referredBy,
    stats: {
      total: referrals.length,
      pending: referrals.filter((r) => r.status === REFERRAL_STATUS.PENDING).length,
      completed: referrals.filter((r) => r.status === REFERRAL_STATUS.COMPLETED).length,
      walletEarned: round2(walletEarned),
      couponsEarned,
    },
    referrals: referrals.map((r) => ({
      id: String(r._id),
      friendName: friendName(r.referee),
      friendPhone: maskPhone(r.referee?.phone),
      status: r.status,
      joinedAt: r.createdAt,
      completedAt: r.completedAt,
      rewardOutcome: r.referrerReward?.outcome || "",
      rewardLabel: r.referrerReward?.outcome === "issued"
        ? describeReward({ type: r.referrerReward.type, value: r.referrerReward.value })
        : "",
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Admin views                                                         */
/* ------------------------------------------------------------------ */

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listReferralsForAdmin({ status = "all", search = "", page = 1, limit = 20 }) {
  const query = {};
  if (Object.values(REFERRAL_STATUS).includes(status)) query.status = status;

  const term = String(search || "").trim();
  if (term) {
    const rx = new RegExp(escapeRegex(term), "i");
    const users = await User.find({ $or: [{ name: rx }, { phone: rx }] }).select("_id").limit(200).lean();
    const ids = users.map((u) => u._id);
    query.$or = [{ code: normalizeReferralCode(term) }, { referrer: { $in: ids } }, { referee: { $in: ids } }];
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);

  const [items, total, statusCounts, rewardTotals] = await Promise.all([
    Referral.find(query)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .populate("referrer", "name phone referralCode")
      .populate("referee", "name phone")
      .populate("qualifyingOrderId", "orderId")
      .lean(),
    Referral.countDocuments(query),
    Referral.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    Referral.aggregate([
      { $match: { status: REFERRAL_STATUS.COMPLETED } },
      { $project: { rewards: ["$referrerReward", "$refereeReward"] } },
      { $unwind: "$rewards" },
      { $match: { "rewards.outcome": "issued" } },
      {
        $group: {
          _id: null,
          walletPaid: { $sum: { $cond: [{ $eq: ["$rewards.type", "wallet"] }, "$rewards.value", 0] } },
          couponsIssued: { $sum: { $cond: [{ $ne: ["$rewards.type", "wallet"] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const counts = Object.fromEntries(statusCounts.map((c) => [c._id, c.n]));
  return {
    items: items.map((r) => ({
      id: String(r._id),
      code: r.code,
      status: r.status,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
      orderId: r.qualifyingOrderId?.orderId || null,
      referrer: r.referrer ? { id: String(r.referrer._id), name: r.referrer.name, phone: r.referrer.phone } : null,
      referee: r.referee ? { id: String(r.referee._id), name: r.referee.name, phone: r.referee.phone } : null,
      referrerReward: r.referrerReward || {},
      refereeReward: r.refereeReward || {},
    })),
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.ceil(total / safeLimit) || 1,
    stats: {
      total: (counts.pending || 0) + (counts.completed || 0),
      pending: counts.pending || 0,
      completed: counts.completed || 0,
      walletPaid: round2(rewardTotals[0]?.walletPaid || 0),
      couponsIssued: rewardTotals[0]?.couponsIssued || 0,
    },
  };
}

export default {
  getReferralSettings,
  describeReward,
  toPublicProgram,
  ensureReferralCode,
  applyReferralCode,
  processDeliveredOrderForReferral,
  getMyReferralSummary,
  listReferralsForAdmin,
};
