import mongoose from "mongoose";

const rewardSnapshotSchema = new mongoose.Schema(
  { label: String, type: String, value: Number },
  { _id: false },
);

const spinAttemptSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "SpinCampaign", required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rewardId: { type: mongoose.Schema.Types.ObjectId, ref: "SpinReward", default: null },
    customerRewardId: { type: mongoose.Schema.Types.ObjectId, ref: "CustomerReward", default: null },
    outcome: { type: String, enum: ["reward", "no_prize"], required: true },
    segmentIndex: { type: Number, default: 0 },
    rewardSnapshot: { type: rewardSnapshotSchema, default: () => ({}) },
    // client-generated per click; makes retries of the same click return the same result
    idempotencyKey: { type: String, required: true },
    ipHash: { type: String, default: "" },
    userAgent: { type: String, default: "", maxlength: 200 },
  },
  { timestamps: true },
);

// A given click can only ever produce one attempt (=> one reward)
spinAttemptSchema.index({ customerId: 1, idempotencyKey: 1 }, { unique: true });
spinAttemptSchema.index({ campaignId: 1, createdAt: -1 });
spinAttemptSchema.index({ campaignId: 1, rewardId: 1 });
spinAttemptSchema.index({ campaignId: 1, customerId: 1 });

export default mongoose.model("SpinAttempt", spinAttemptSchema);
