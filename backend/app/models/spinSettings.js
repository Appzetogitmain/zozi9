import mongoose from "mongoose";

/**
 * Singleton (key = "default") holding the global Spin & Win master switches.
 * Disabled by default so nothing is exposed until an admin turns it on.
 */
const spinSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    enabled: { type: Boolean, default: false },
    popupEnabled: { type: Boolean, default: true },
    // Rewards already issued stay redeemable even if the feature is switched off
    allowRedemptionWhenDisabled: { type: Boolean, default: true },
    autoApplyReward: { type: Boolean, default: false },
    // Cancelled / payment-failed orders give the reward back (if still valid)
    restoreOnCancel: { type: Boolean, default: true },
    restoreOnRefund: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

export default mongoose.model("SpinSettings", spinSettingsSchema);
