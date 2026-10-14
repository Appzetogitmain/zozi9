import mongoose from "mongoose";

export const REWARD_TYPES = [
  "fixed",
  "percentage",
  "free_delivery",
  "wallet_cashback",
  "free_product",
  "no_prize",
];

const spinRewardSchema = new mongoose.Schema(
  {
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SpinCampaign",
      required: true,
      index: true,
    },
    label: { type: String, required: true, trim: true, maxlength: 40 },
    color: { type: String, trim: true, default: "" }, // empty => derived from app theme
    icon: { type: String, trim: true, default: "gift" },
    type: { type: String, enum: REWARD_TYPES, required: true },
    value: { type: Number, default: 0, min: 0 },

    // Relative chance. Probability = weight / sum(weights of live slices).
    weight: { type: Number, required: true, min: 0, default: 1 },

    minCartValue: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: null, min: 0 },

    totalQuantity: { type: Number, default: null, min: 0 }, // null = unlimited
    awardedCount: { type: Number, default: 0, min: 0 },
    perCustomerLimit: { type: Number, default: null, min: 1 }, // null = unlimited

    validityDays: { type: Number, default: null, min: 1, max: 365 }, // null = campaign default

    eligibleCategoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    eligibleProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    eligibleSellerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Seller" }],
    freeProductId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },

    // Only company-funded rewards are settled today (seller payouts are never reduced).
    fundedBy: { type: String, enum: ["company"], default: "company" },

    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

spinRewardSchema.index({ campaignId: 1, sortOrder: 1, _id: 1 });

export default mongoose.model("SpinReward", spinRewardSchema);
