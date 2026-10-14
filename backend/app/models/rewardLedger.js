import mongoose from "mongoose";

/** Append-only money trail for Spin & Win (discount cost, cashback credits, restores). */
const rewardLedgerSchema = new mongoose.Schema(
  {
    entryType: {
      type: String,
      enum: ["issued", "redeemed", "restored", "cashback_credited"],
      required: true,
    },
    customerRewardId: { type: mongoose.Schema.Types.ObjectId, ref: "CustomerReward", required: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "SpinCampaign", required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    amount: { type: Number, default: 0 },
    fundedBy: { type: String, default: "company" },
    meta: { type: Object, default: {} },
  },
  { timestamps: true },
);

rewardLedgerSchema.index({ campaignId: 1, entryType: 1, createdAt: -1 });
rewardLedgerSchema.index({ customerRewardId: 1, createdAt: 1 });
rewardLedgerSchema.index({ orderId: 1 });

export default mongoose.model("RewardLedger", rewardLedgerSchema);
