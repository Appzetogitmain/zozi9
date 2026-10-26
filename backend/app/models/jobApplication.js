import mongoose from "mongoose";

export const APPLICATION_STATUSES = [
  "pending",
  "under_review",
  "shortlisted",
  "interview_scheduled",
  "selected",
  "rejected",
];

const noteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    byName: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: true },
);

const statusChangeSchema = new mongoose.Schema(
  {
    status: { type: String, enum: APPLICATION_STATUSES, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    byName: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const jobApplicationSchema = new mongoose.Schema(
  {
    // null once the job listing is deleted; jobTitle keeps what was applied for
    job: { type: mongoose.Schema.Types.ObjectId, ref: "JobOpening", default: null },
    jobTitle: { type: String, required: true, trim: true },

    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true }, // E.164, e.g. +919876543210
    email: { type: String, trim: true, lowercase: true, default: "" },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    address: { type: String, trim: true, default: "", maxlength: 500 },
    experienceType: { type: String, enum: ["fresher", "experienced"], required: true },
    experienceYears: { type: Number, min: 0, max: 50, default: 0 },
    message: { type: String, trim: true, default: "", maxlength: 1000 },

    // Stored in a private folder (never under the public /uploads); downloaded by admins only
    resume: {
      fileName: { type: String, default: "" },
      originalName: { type: String, default: "" },
      size: { type: Number, default: 0 },
      mimeType: { type: String, default: "" },
    },

    status: { type: String, enum: APPLICATION_STATUSES, default: "pending" },
    statusHistory: { type: [statusChangeSchema], default: [] },
    interviewAt: { type: Date, default: null },
    notes: { type: [noteSchema], default: [] },

    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    ipAddress: { type: String, default: "" },
  },
  { timestamps: true },
);

jobApplicationSchema.index({ createdAt: -1 });
jobApplicationSchema.index({ status: 1, createdAt: -1 });
jobApplicationSchema.index({ job: 1, createdAt: -1 });
jobApplicationSchema.index({ phone: 1, job: 1, createdAt: -1 });

export default mongoose.model("JobApplication", jobApplicationSchema);
