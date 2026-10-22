import mongoose from "mongoose";

export const CUSTOMER_REWARD_STATUS = ["available", "redeemed", "expired", "void"];

// A field literally named `type` must live in its own sub-schema, otherwise Mongoose
// reads it as a type declaration.
const snapshotSchema = new mongoose.Schema(
  {
    label: String,
    type: String,
    value: Number,
    minCartValue: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: null },
    eligibleCategoryIds: [mongoose.Schema.Types.ObjectId],
    eligibleProductIds: [mongoose.Schema.Types.ObjectId],
    eligibleSellerIds: [mongoose.Schema.Types.ObjectId],
    freeProductId: { type: mongoose.Schema.Types.ObjectId, default: null },
    fundedBy: { type: String, default: "company" },
  },
  { _id: false },
);

function isSpinReward() {
  return this.source !== "referral";
}

const customerRewardSchema = new mongoose.Schema(
  {
    // spin = won on the wheel, referral = issued by Refer & Earn (no campaign / reward / attempt)
    source: { type: String, enum: ["spin", "referral"], default: "spin" },
    referralId: { type: mongoose.Schema.Types.ObjectId, ref: "Referral", default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "SpinCampaign", required: isSpinReward },
    rewardId: { type: mongoose.Schema.Types.ObjectId, ref: "SpinReward", required: isSpinReward },
    // Unique index below: referral rewards get a fresh ObjectId here so they never collide on null
    attemptId: { type: mongoose.Schema.Types.ObjectId, ref: "SpinAttempt", required: true },
    code: { type: String, required: true, unique: true },

    // Frozen copy of the rule at win time (later admin edits never change an issued reward)
    snapshot: { type: snapshotSchema, default: () => ({}) },

    status: { type: String, enum: CUSTOMER_REWARD_STATUS, default: "available" },
    expiresAt: { type: Date, required: true },
    redeemedAt: { type: Date, default: null },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    publicOrderId: { type: String, default: "" },
    checkoutGroupId: { type: String, default: "" },
    discountApplied: { type: Number, default: 0 },
    restoredCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

customerRewardSchema.index({ attemptId: 1 }, { unique: true });
customerRewardSchema.index({ customerId: 1, status: 1, expiresAt: 1 });
customerRewardSchema.index({ campaignId: 1, status: 1 });
customerRewardSchema.index({ campaignId: 1, rewardId: 1, customerId: 1 });
customerRewardSchema.index({ orderId: 1 });

export default mongoose.model("CustomerReward", customerRewardSchema);
