import mongoose from "mongoose";

const maintenanceAuditLogSchema = new mongoose.Schema(
    {
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            required: true,
        },
        action: {
            type: String,
            enum: ["ENABLED", "DISABLED", "UPDATED", "EMERGENCY_STOP"],
            required: true,
        },
        durationMinutes: {
            type: Number,
            default: 0,
        },
        reason: {
            type: String,
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
        }
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("MaintenanceAuditLog", maintenanceAuditLogSchema);
