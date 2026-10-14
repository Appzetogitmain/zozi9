import mongoose from "mongoose";

export const CAMPAIGN_STATUS = ["draft", "scheduled", "active", "paused", "completed"];

const spinCampaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    title: { type: String, trim: true, maxlength: 120, default: "Spin & Win" },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    bannerImage: { type: String, trim: true, default: "" },
    status: { type: String, enum: CAMPAIGN_STATUS, default: "draft", index: true },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },

    popup: {
      delaySeconds: { type: Number, default: 3, min: 0, max: 60 },
      // every_session: once per app session, daily/weekly: at most once per period, once: never again after shown
      frequency: {
        type: String,
        enum: ["every_session", "daily", "weekly", "once"],
        default: "every_session",
      },
    },

    // When false, logged-out visitors still see the popup but must log in to spin.
    requireLogin: { type: Boolean, default: true },

    eligibility: {
      audience: {
        type: String,
        enum: ["all", "new_customers", "existing_customers"],
        default: "all",
      },
      // for existing_customers: minimum number of previous (non-cancelled) orders
      minOrders: { type: Number, default: 1, min: 0 },
    },

    participation: {
      maxSpins: { type: Number, default: 1, min: 1, max: 1000 },
      period: { type: String, enum: ["campaign", "day", "week", "month"], default: "campaign" },
    },

    rewardValidityDays: { type: Number, default: 7, min: 1, max: 365 },
    terms: { type: String, trim: true, maxlength: 4000, default: "" },

    auditLog: {
      type: [
        {
          at: { type: Date, default: Date.now },
          by: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
          action: String,
          summary: String,
        },
      ],
      default: [],
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

spinCampaignSchema.index({ status: 1, startAt: 1, endAt: 1 });

export default mongoose.model("SpinCampaign", spinCampaignSchema);
