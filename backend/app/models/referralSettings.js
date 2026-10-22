import mongoose from "mongoose";

// wallet = cash added to the customer wallet; the rest are one-time checkout coupons
export const REFERRAL_REWARD_TYPES = ["wallet", "fixed", "percentage", "free_delivery"];

const rewardConfigSchema = new mongoose.Schema(
  {
    type: { type: String, enum: REFERRAL_REWARD_TYPES, default: "wallet" },
    value: { type: Number, default: 0, min: 0 },
    // Coupon types only
    maxDiscount: { type: Number, default: null },
    minCartValue: { type: Number, default: 0, min: 0 },
    validityDays: { type: Number, default: 30, min: 1 },
  },
  { _id: false },
);

/**
 * Singleton (key = "default") holding the Refer & Earn rules.
 * Disabled by default so nothing is exposed until an admin turns it on.
 */
const referralSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    enabled: { type: Boolean, default: false },
    // Reward for the customer who shared the code
    referrerReward: { type: rewardConfigSchema, default: () => ({ type: "wallet", value: 50 }) },
    // Welcome reward for the new customer who used the code
    refereeReward: { type: rewardConfigSchema, default: () => ({ type: "wallet", value: 50 }) },
    // The friend's delivered order must be worth at least this much (items subtotal)
    minOrderValue: { type: Number, default: 0, min: 0 },
    // 0 = no limit on rewarded referrals per customer
    maxReferralsPerUser: { type: Number, default: 0, min: 0 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

export default mongoose.model("ReferralSettings", referralSettingsSchema);
