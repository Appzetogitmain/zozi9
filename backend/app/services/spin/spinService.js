/**
 * Customer-facing Spin & Win service: campaign lookup, eligibility, the spin
 * itself, impressions and "my rewards".
 *
 * Safety model for `playSpin` (everything in ONE transaction):
 *  1. participation slot is claimed with a conditional atomic $inc (limit can't be exceeded)
 *  2. reward inventory is claimed with a conditional atomic $inc (stock can't go negative)
 *  3. attempt + customer reward are written with a unique (customer, idempotencyKey) index
 * If anything fails, all of it rolls back, so nothing is half-issued.
 */
import mongoose from "mongoose";
import crypto from "node:crypto";
import SpinSettings from "../../models/spinSettings.js";
import SpinCampaign from "../../models/spinCampaign.js";
import SpinReward from "../../models/spinReward.js";
import SpinAttempt from "../../models/spinAttempt.js";
import SpinParticipation from "../../models/spinParticipation.js";
import SpinImpression from "../../models/spinImpression.js";
import CustomerReward from "../../models/customerReward.js";
import RewardLedger from "../../models/rewardLedger.js";
import Order from "../../models/order.js";
import User from "../../models/customer.js";
import Transaction from "../../models/transaction.js";
import {
  effectiveCampaignStatus,
  generateRewardCode,
  periodKey,
  periodResetsAt,
  round2,
  weightedPick,
} from "./spinLogic.js";

export class SpinError extends Error {
  constructor(statusCode, message, code = "SPIN_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Settings / campaign lookup                                          */
/* ------------------------------------------------------------------ */

export async function getSpinSettings() {
  return SpinSettings.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
}

/** The single campaign that is running right now (or null). */
export async function findLiveCampaign(now = new Date()) {
  return SpinCampaign.findOne({
    status: { $in: ["active", "scheduled"] },
    startAt: { $lte: now },
    endAt: { $gte: now },
  })
    .sort({ startAt: -1 })
    .lean();
}

export async function listLiveSlices(campaignId) {
  return SpinReward.find({ campaignId, isActive: true }).sort({ sortOrder: 1, _id: 1 }).lean();
}

const valueLabel = (reward) => {
  switch (reward.type) {
    case "fixed":
    case "wallet_cashback":
      return `₹${reward.value}`;
    case "percentage":
      return `${reward.value}%`;
    case "free_delivery":
      return "Free Delivery";
    case "free_product":
      return "Free Gift";
    default:
      return "";
  }
};

/** What the public wheel is allowed to know about a slice (no weights / stock). */
export function toPublicSlice(reward) {
  return {
    id: String(reward._id),
    label: reward.label,
    color: reward.color || "",
    icon: reward.icon || "gift",
    type: reward.type,
    valueLabel: valueLabel(reward),
  };
}

export function toPublicCampaign(campaign, slices) {
  return {
    id: String(campaign._id),
    name: campaign.name,
    title: campaign.title,
    description: campaign.description,
    bannerImage: campaign.bannerImage,
    startAt: campaign.startAt,
    endAt: campaign.endAt,
    requireLogin: campaign.requireLogin,
    popup: campaign.popup,
    terms: campaign.terms,
    maxSpins: campaign.participation?.maxSpins,
    period: campaign.participation?.period,
    slices: slices.map(toPublicSlice),
  };
}

/* ------------------------------------------------------------------ */
/* Eligibility                                                         */
/* ------------------------------------------------------------------ */

async function countCustomerOrders(customerId) {
  return Order.countDocuments({ customer: customerId, status: { $ne: "cancelled" } });
}

/**
 * Can this customer spin right now?
 * Returns { eligible, canSpin, reason, remainingSpins, usedSpins, maxSpins, resetsAt }
 */
export async function evaluateEligibility({ campaign, customerId, settings, now = new Date() }) {
  const maxSpins = campaign.participation?.maxSpins || 1;
  const period = campaign.participation?.period || "campaign";
  const base = {
    eligible: false,
    canSpin: false,
    reason: "",
    remainingSpins: 0,
    usedSpins: 0,
    maxSpins,
    resetsAt: periodResetsAt(period, now),
  };

  if (!settings?.enabled) return { ...base, reason: "disabled" };
  if (effectiveCampaignStatus(campaign, now) !== "active") return { ...base, reason: "inactive" };
  if (!customerId) return { ...base, reason: "login_required" };

  const audience = campaign.eligibility?.audience || "all";
  if (audience !== "all") {
    const orderCount = await countCustomerOrders(customerId);
    if (audience === "new_customers" && orderCount > 0) return { ...base, reason: "not_new_customer" };
    if (audience === "existing_customers") {
      const needed = Math.max(1, Number(campaign.eligibility?.minOrders ?? 1));
      if (orderCount < needed) return { ...base, reason: "not_existing_customer" };
    }
  }

  const row = await SpinParticipation.findOne({
    campaignId: campaign._id,
    customerId,
    periodKey: periodKey(period, now),
  }).lean();
  const used = row?.count || 0;
  const remaining = Math.max(0, maxSpins - used);

  return {
    ...base,
    eligible: true,
    usedSpins: used,
    remainingSpins: remaining,
    canSpin: remaining > 0,
    reason: remaining > 0 ? "" : "limit_reached",
  };
}

/** GET /spin/campaign/active payload */
export async function getActiveCampaignForCustomer({ customerId = null, now = new Date() } = {}) {
  const settings = await getSpinSettings();
  if (!settings.enabled) return { active: false, reason: "disabled" };

  const campaign = await findLiveCampaign(now);
  if (!campaign) return { active: false, reason: "no_campaign" };

  const slices = await listLiveSlices(campaign._id);
  if (slices.length < 2) return { active: false, reason: "no_campaign" };

  const eligibility = await evaluateEligibility({ campaign, customerId, settings, now });

  // requireLogin=true  -> the popup is only shown to logged-in customers
  // requireLogin=false -> guests see it too and are asked to log in when they press Spin
  const showPopup =
    settings.popupEnabled !== false && (customerId ? true : campaign.requireLogin === false);

  return {
    active: true,
    showPopup,
    campaign: toPublicCampaign(campaign, slices),
    eligibility,
    serverTime: now.toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Impressions                                                         */
/* ------------------------------------------------------------------ */

export async function recordImpression({ campaignId, customerId = null, viewerKey }) {
  const campaign = await findLiveCampaign();
  if (!campaign || String(campaign._id) !== String(campaignId)) return { recorded: false };
  const key = String(customerId || viewerKey || "").slice(0, 80);
  if (!key) return { recorded: false };
  await SpinImpression.create({ campaignId: campaign._id, customerId: customerId || null, viewerKey: key });
  return { recorded: true };
}

/* ------------------------------------------------------------------ */
/* The spin                                                            */
/* ------------------------------------------------------------------ */

function buildResult({ attempt, customerReward, slices, remainingSpins, duplicate = false }) {
  const rewardView = customerReward
    ? toCustomerRewardView(customerReward)
    : null;
  return {
    attemptId: String(attempt._id),
    outcome: attempt.outcome,
    segmentIndex: attempt.segmentIndex,
    slice: slices[attempt.segmentIndex] ? toPublicSlice(slices[attempt.segmentIndex]) : null,
    label: attempt.rewardSnapshot?.label || "Better Luck Next Time",
    reward: rewardView,
    remainingSpins,
    duplicate,
  };
}

async function remainingFor(campaign, customerId) {
  const period = campaign.participation?.period || "campaign";
  const row = await SpinParticipation.findOne({
    campaignId: campaign._id,
    customerId,
    periodKey: periodKey(period),
  }).lean();
  return Math.max(0, (campaign.participation?.maxSpins || 1) - (row?.count || 0));
}

async function replayExistingAttempt({ customerId, idempotencyKey }) {
  const existing = await SpinAttempt.findOne({ customerId, idempotencyKey }).lean();
  if (!existing) return null;
  const campaign = await SpinCampaign.findById(existing.campaignId).lean();
  const slices = await listLiveSlices(existing.campaignId);
  const customerReward = existing.customerRewardId
    ? await CustomerReward.findById(existing.customerRewardId).lean()
    : null;
  return buildResult({
    attempt: existing,
    customerReward,
    slices,
    remainingSpins: campaign ? await remainingFor(campaign, customerId) : 0,
    duplicate: true,
  });
}

/**
 * Plays one spin for a customer. The winner is chosen here, on the server.
 */
export async function playSpin({ customerId, idempotencyKey, meta = {} }) {
  if (!customerId) throw new SpinError(401, "Please log in to spin", "LOGIN_REQUIRED");
  const key = String(idempotencyKey || "").trim();
  if (key.length < 8 || key.length > 100) {
    throw new SpinError(400, "A valid Idempotency-Key header is required", "IDEMPOTENCY_REQUIRED");
  }

  // A retry of the same click returns the same outcome and never issues a 2nd reward
  const replay = await replayExistingAttempt({ customerId, idempotencyKey: key });
  if (replay) return replay;

  const now = new Date();
  const settings = await getSpinSettings();
  if (!settings.enabled) {
    throw new SpinError(403, "Spin & Win is not available right now", "DISABLED");
  }
  const campaign = await findLiveCampaign(now);
  if (!campaign) throw new SpinError(404, "There is no live Spin & Win campaign", "NO_CAMPAIGN");

  const eligibility = await evaluateEligibility({ campaign, customerId, settings, now });
  if (!eligibility.canSpin) {
    const messages = {
      limit_reached: "You have used all your spins for this campaign",
      not_new_customer: "This campaign is only for new customers",
      not_existing_customer: "Place an order to unlock this campaign",
      inactive: "This campaign is not live",
    };
    throw new SpinError(
      eligibility.reason === "limit_reached" ? 429 : 403,
      messages[eligibility.reason] || "You are not eligible for this campaign",
      String(eligibility.reason || "NOT_ELIGIBLE").toUpperCase(),
    );
  }

  const slices = await listLiveSlices(campaign._id);
  if (slices.length < 2) throw new SpinError(409, "This campaign is not ready yet", "NO_CAMPAIGN");

  const period = campaign.participation?.period || "campaign";
  const maxSpins = campaign.participation?.maxSpins || 1;
  const bucket = periodKey(period, now);

  const session = await mongoose.startSession();
  let outcome = null;
  try {
    await session.withTransaction(async () => {
      outcome = null; // withTransaction may retry the callback

      /* 1. claim a participation slot (atomic, conditional) */
      const claimed = await SpinParticipation.findOneAndUpdate(
        { campaignId: campaign._id, customerId, periodKey: bucket, count: { $lt: maxSpins } },
        { $inc: { count: 1 } },
        { new: true, upsert: true, session },
      ).catch((error) => {
        // upsert collided with an existing row that is already at the limit
        if (error?.code === 11000) return null;
        throw error;
      });
      if (!claimed) throw new SpinError(429, "You have used all your spins for this campaign", "LIMIT_REACHED");

      /* 2. build the candidate pool (weights, per-customer limits) */
      const given = await CustomerReward.aggregate([
        { $match: { campaignId: campaign._id, customerId: new mongoose.Types.ObjectId(String(customerId)) } },
        { $group: { _id: "$rewardId", n: { $sum: 1 } } },
      ]).session(session);
      const givenByReward = new Map(given.map((g) => [String(g._id), g.n]));

      let pool = slices.filter((reward) => {
        if (!(Number(reward.weight) > 0)) return false;
        if (reward.perCustomerLimit != null && (givenByReward.get(String(reward._id)) || 0) >= reward.perCustomerLimit) {
          return false;
        }
        return true;
      });

      /* 3. pick + claim inventory; if the pick just ran out, pick again */
      let chosen = null;
      while (pool.length > 0 && !chosen) {
        const pick = weightedPick(pool);
        if (!pick) break;
        const claimedReward = await SpinReward.findOneAndUpdate(
          {
            _id: pick._id,
            isActive: true,
            $or: [{ totalQuantity: null }, { $expr: { $lt: ["$awardedCount", "$totalQuantity"] } }],
          },
          { $inc: { awardedCount: 1 } },
          { new: true, session },
        );
        if (claimedReward) chosen = pick;
        else pool = pool.filter((r) => String(r._id) !== String(pick._id));
      }

      /* 4. nothing winnable left -> safe no-prize outcome */
      if (!chosen) {
        chosen =
          slices.find((r) => r.type === "no_prize") || null;
      }

      const attemptId = new mongoose.Types.ObjectId();
      const segmentIndex = chosen
        ? Math.max(0, slices.findIndex((r) => String(r._id) === String(chosen._id)))
        : 0;
      const isPrize = !!chosen && chosen.type !== "no_prize";

      let customerReward = null;
      if (isPrize) {
        const validityDays = chosen.validityDays || campaign.rewardValidityDays || 7;
        const isCashback = chosen.type === "wallet_cashback";
        const [created] = await CustomerReward.create(
          [
            {
              customerId,
              campaignId: campaign._id,
              rewardId: chosen._id,
              attemptId,
              code: generateRewardCode(),
              snapshot: {
                label: chosen.label,
                type: chosen.type,
                value: chosen.value,
                minCartValue: chosen.minCartValue || 0,
                maxDiscount: chosen.maxDiscount ?? null,
                eligibleCategoryIds: chosen.eligibleCategoryIds || [],
                eligibleProductIds: chosen.eligibleProductIds || [],
                eligibleSellerIds: chosen.eligibleSellerIds || [],
                freeProductId: chosen.freeProductId || null,
                fundedBy: chosen.fundedBy || "company",
              },
              status: isCashback ? "redeemed" : "available",
              expiresAt: new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000),
              redeemedAt: isCashback ? now : null,
              discountApplied: isCashback ? round2(chosen.value) : 0,
            },
          ],
          { session },
        );
        customerReward = created;

        if (isCashback) {
          const amount = round2(chosen.value);
          await User.updateOne({ _id: customerId }, { $inc: { walletBalance: amount } }, { session });
          await Transaction.create(
            [
              {
                user: customerId,
                userModel: "User",
                type: "Bonus",
                amount,
                status: "Settled",
                reference: `SPIN-CB-${attemptId}`,
                meta: { source: "spin_win", campaignId: String(campaign._id), rewardId: String(chosen._id) },
              },
            ],
            { session },
          );
          await RewardLedger.create(
            [
              {
                entryType: "cashback_credited",
                customerRewardId: created._id,
                campaignId: campaign._id,
                customerId,
                amount,
              },
            ],
            { session },
          );
        } else {
          await RewardLedger.create(
            [
              {
                entryType: "issued",
                customerRewardId: created._id,
                campaignId: campaign._id,
                customerId,
                amount: 0,
                meta: { type: chosen.type, value: chosen.value },
              },
            ],
            { session },
          );
        }
      }

      const [attempt] = await SpinAttempt.create(
        [
          {
            _id: attemptId,
            campaignId: campaign._id,
            customerId,
            rewardId: chosen?._id || null,
            customerRewardId: customerReward?._id || null,
            outcome: isPrize ? "reward" : "no_prize",
            segmentIndex,
            rewardSnapshot: {
              label: chosen?.label || "Better Luck Next Time",
              type: chosen?.type || "no_prize",
              value: chosen?.value || 0,
            },
            idempotencyKey: key,
            ipHash: meta.ip
              ? crypto.createHash("sha256").update(String(meta.ip)).digest("hex").slice(0, 24)
              : "",
            userAgent: String(meta.userAgent || "").slice(0, 200),
          },
        ],
        { session },
      );

      outcome = { attempt: attempt.toObject(), customerReward: customerReward?.toObject() || null };
    });
  } catch (error) {
    if (error?.code === 11000) {
      // Same click arrived twice in parallel: the other request won, return its result
      const replayed = await replayExistingAttempt({ customerId, idempotencyKey: key });
      if (replayed) return replayed;
    }
    throw error;
  } finally {
    await session.endSession();
  }

  return buildResult({
    attempt: outcome.attempt,
    customerReward: outcome.customerReward,
    slices,
    remainingSpins: await remainingFor(campaign, customerId),
  });
}

/* ------------------------------------------------------------------ */
/* My rewards                                                          */
/* ------------------------------------------------------------------ */

export function effectiveRewardStatus(reward, now = new Date()) {
  if (reward.status === "available" && new Date(reward.expiresAt) <= now) return "expired";
  return reward.status;
}

export function toCustomerRewardView(reward, now = new Date()) {
  const snap = reward.snapshot || {};
  const status = effectiveRewardStatus(reward, now);
  return {
    id: String(reward._id),
    code: reward.code,
    source: reward.source || "spin",
    status,
    label: snap.label,
    type: snap.type,
    value: snap.value,
    valueLabel: valueLabel({ type: snap.type, value: snap.value }),
    minCartValue: snap.minCartValue || 0,
    maxDiscount: snap.maxDiscount ?? null,
    restrictedToCategories: (snap.eligibleCategoryIds || []).length > 0,
    restrictedToProducts: (snap.eligibleProductIds || []).length > 0,
    restrictedToSellers: (snap.eligibleSellerIds || []).length > 0,
    freeProductId: snap.freeProductId ? String(snap.freeProductId) : null,
    expiresAt: reward.expiresAt,
    wonAt: reward.createdAt,
    redeemedAt: reward.redeemedAt,
    orderId: reward.publicOrderId || null,
    discountApplied: reward.discountApplied || 0,
  };
}

export async function listMyRewards({ customerId, status = "all", page = 1, limit = 20 }) {
  const now = new Date();
  // lazily persist expiry so indexes / reports see real statuses
  await CustomerReward.updateMany(
    { customerId, status: "available", expiresAt: { $lte: now } },
    { $set: { status: "expired" } },
  );

  const query = { customerId };
  if (["available", "redeemed", "expired"].includes(status)) query.status = status;

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);

  const [items, total, counts] = await Promise.all([
    CustomerReward.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    CustomerReward.countDocuments(query),
    CustomerReward.aggregate([
      { $match: { customerId: new mongoose.Types.ObjectId(String(customerId)) } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c._id, c.n]));
  return {
    items: items.map((r) => toCustomerRewardView(r, now)),
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.ceil(total / safeLimit) || 1,
    counts: {
      available: countMap.available || 0,
      redeemed: countMap.redeemed || 0,
      expired: countMap.expired || 0,
    },
  };
}

export default {
  getSpinSettings,
  getActiveCampaignForCustomer,
  evaluateEligibility,
  playSpin,
  recordImpression,
  listMyRewards,
};
