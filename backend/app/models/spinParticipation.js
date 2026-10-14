import mongoose from "mongoose";

/**
 * One row per (campaign, customer, period). `count` is incremented with a
 * conditional atomic update, so parallel requests can never exceed the limit.
 */
const spinParticipationSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "SpinCampaign", required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    periodKey: { type: String, required: true },
    count: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

spinParticipationSchema.index({ campaignId: 1, customerId: 1, periodKey: 1 }, { unique: true });

export default mongoose.model("SpinParticipation", spinParticipationSchema);
