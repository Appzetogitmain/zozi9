import mongoose from "mongoose";

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship", "flexible"];

const jobOpeningSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, default: "", maxlength: 3000 },
    responsibilities: { type: [String], default: [] },
    requirements: { type: [String], default: [] },
    location: { type: String, required: true, trim: true, maxlength: 120 },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, default: "full_time" },
    // Optional, shown as written, e.g. "₹12,000 - ₹18,000 / month"
    salary: { type: String, trim: true, default: "", maxlength: 80 },
    openings: { type: Number, min: 0, default: null },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true },
);

jobOpeningSchema.index({ isActive: 1, sortOrder: 1, createdAt: -1 });

export default mongoose.model("JobOpening", jobOpeningSchema);
