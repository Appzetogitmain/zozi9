import mongoose from "mongoose";

const spinImpressionSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "SpinCampaign", required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // anonymous visitors are identified by a client-generated session key
    viewerKey: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

spinImpressionSchema.index({ campaignId: 1, viewerKey: 1 });
// impressions are only needed for reporting; keep 180 days
spinImpressionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export default mongoose.model("SpinImpression", spinImpressionSchema);
