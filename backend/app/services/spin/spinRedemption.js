/**
 * Spin & Win <-> checkout integration.
 *
 *  - loadRewardForCheckout : validates a reward the customer wants to use (ownership, status, expiry)
 *  - claimRewardForOrder   : atomically flips available -> redeemed inside the order transaction
 *  - restoreRewardForOrder : gives the reward back when an order is cancelled / payment fails
 *
 * The discount amount itself is never accepted from the client; it is computed by
 * buildCheckoutPricingSnapshot() from server prices.
 */
import mongoose from "mongoose";
import CustomerReward from "../../models/customerReward.js";
import RewardLedger from "../../models/rewardLedger.js";
import Order from "../../models/order.js";
import { getSpinSettings, SpinError, effectiveRewardStatus } from "./spinService.js";
import { CHECKOUT_REWARD_TYPES } from "./spinLogic.js";

/**
 * Returns the frozen reward snapshot (with `_id`) to price the cart with.
 * Throws SpinError when the reward cannot be used.
 */
export async function loadRewardForCheckout({ customerId, rewardId, session = null, now = new Date() }) {
  if (!rewardId || !mongoose.isValidObjectId(String(rewardId))) {
    throw new SpinError(400, "Invalid reward", "INVALID_REWARD");
  }

  const query = CustomerReward.findOne({ _id: rewardId, customerId }).lean();
  if (session) query.session(session);
  const reward = await query;
  // same message for "not yours" and "does not exist" so ids cannot be probed
  if (!reward) throw new SpinError(404, "Reward not found", "REWARD_NOT_FOUND");

  const status = effectiveRewardStatus(reward, now);
  if (status === "redeemed") throw new SpinError(409, "This reward has already been used", "REWARD_USED");
  if (status === "expired") throw new SpinError(410, "This reward has expired", "REWARD_EXPIRED");
  if (status !== "available") throw new SpinError(409, "This reward is not available", "REWARD_UNAVAILABLE");

  const settings = await getSpinSettings();
  if (!settings.enabled && !settings.allowRedemptionWhenDisabled) {
    throw new SpinError(403, "Spin & Win rewards cannot be used right now", "DISABLED");
  }

  if (!CHECKOUT_REWARD_TYPES.includes(reward.snapshot?.type)) {
    throw new SpinError(400, "This reward cannot be used on an order", "NOT_CHECKOUT_REWARD");
  }

  return { ...reward.snapshot, _id: reward._id, code: reward.code, expiresAt: reward.expiresAt };
}

/**
 * Atomically marks the reward as redeemed for an order. Must run inside the
 * same transaction that creates the order: if the order fails, this rolls back
 * and the reward stays available. Two orders racing for one reward cannot both win.
 */
export async function claimRewardForOrder({
  rewardId,
  customerId,
  order,
  checkoutGroupId,
  discountApplied,
  session,
  now = new Date(),
}) {
  const claimed = await CustomerReward.findOneAndUpdate(
    { _id: rewardId, customerId, status: "available", expiresAt: { $gt: now } },
    {
      $set: {
        status: "redeemed",
        redeemedAt: now,
        orderId: order._id,
        publicOrderId: order.orderId,
        checkoutGroupId: checkoutGroupId || "",
        discountApplied,
      },
    },
    { new: true, session },
  );
  if (!claimed) {
    throw new SpinError(409, "This reward was just used or has expired. Please review your order.", "REWARD_CONFLICT");
  }

  await RewardLedger.create(
    [
      {
        entryType: "redeemed",
        customerRewardId: claimed._id,
        campaignId: claimed.campaignId,
        customerId,
        orderId: order._id,
        amount: discountApplied,
        fundedBy: claimed.snapshot?.fundedBy || "company",
        meta: { publicOrderId: order.orderId, checkoutGroupId: checkoutGroupId || "" },
      },
    ],
    { session },
  );
  return claimed;
}

/**
 * Gives a redeemed reward back after a cancellation / failed payment, following
 * the admin policy (restoreOnCancel). A reward spread over several seller orders
 * is only restored once every one of those orders is cancelled.
 * Safe to call more than once (idempotent) and never throws into the cancel flow.
 */
export async function restoreRewardForOrder(order, { reason = "cancelled", session = null } = {}) {
  try {
    const rewardId = order?.spinRewardId;
    if (!rewardId) return { restored: false, reason: "no_reward" };

    const settings = await getSpinSettings();
    if (reason === "refund" ? !settings.restoreOnRefund : !settings.restoreOnCancel) {
      return { restored: false, reason: "policy" };
    }

    const stillActive = await Order.countDocuments(
      {
        spinRewardId: rewardId,
        _id: { $ne: order._id },
        status: { $ne: "cancelled" },
      },
      session ? { session } : undefined,
    );
    if (stillActive > 0) return { restored: false, reason: "other_orders_active" };

    const now = new Date();
    const current = await CustomerReward.findById(rewardId, null, session ? { session } : undefined);
    if (!current || current.status !== "redeemed") return { restored: false, reason: "not_redeemed" };

    const nextStatus = new Date(current.expiresAt) > now ? "available" : "expired";
    const restored = await CustomerReward.findOneAndUpdate(
      { _id: rewardId, status: "redeemed" },
      {
        $set: {
          status: nextStatus,
          redeemedAt: null,
          orderId: null,
          publicOrderId: "",
          checkoutGroupId: "",
          discountApplied: 0,
        },
        $inc: { restoredCount: 1 },
      },
      { new: true, ...(session ? { session } : {}) },
    );
    if (!restored) return { restored: false, reason: "not_redeemed" };

    await RewardLedger.create(
      [
        {
          entryType: "restored",
          customerRewardId: restored._id,
          campaignId: restored.campaignId,
          customerId: restored.customerId,
          orderId: order._id,
          amount: current.discountApplied || 0,
          meta: { reason, nextStatus },
        },
      ],
      session ? { session } : undefined,
    );
    return { restored: true, status: nextStatus };
  } catch (error) {
    console.warn("[spin] restoreRewardForOrder failed:", error.message);
    return { restored: false, reason: "error" };
  }
}

export default { loadRewardForCheckout, claimRewardForOrder, restoreRewardForOrder };
