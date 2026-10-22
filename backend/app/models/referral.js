import mongoose from "mongoose";

export const REFERRAL_STATUS = Object.freeze({
  PENDING: "pending", // friend signed up, waiting for the first qualifying delivered order
  COMPLETED: "completed", // rewards issued
});

// What was actually given to one side of the referral
const issuedRewardSchema = new mongoose.Schema(
  {
    // issued | skipped_limit (referrer hit maxReferralsPerUser) | none (value was 0)
    outcome: { type: String, default: "" },
    type: { type: String, default: "" },
    value: { type: Number, default: 0 },
    customerRewardId: { type: mongoose.Schema.Types.ObjectId, ref: "CustomerReward", default: null },
    code: { type: String, default: "" },
  },
  { _id: false },
);

const referralSchema = new mongoose.Schema(
  {
    referrer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // A customer can be referred only once
    referee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    status: {
      type: String,
      enum: Object.values(REFERRAL_STATUS),
      default: REFERRAL_STATUS.PENDING,
    },
    qualifyingOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    completedAt: { type: Date, default: null },
    referrerReward: { type: issuedRewardSchema, default: () => ({}) },
    refereeReward: { type: issuedRewardSchema, default: () => ({}) },
  },
  { timestamps: true },
);

referralSchema.index({ referrer: 1, status: 1, createdAt: -1 });
referralSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("Referral", referralSchema);
