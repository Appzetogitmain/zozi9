/**
 * Careers: job openings managed by admins and applications submitted by anyone.
 *
 * Resumes are personal data, so they are written to a private folder that is NOT
 * served as static files; admins download them through an authenticated endpoint.
 */
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import mongoose from "mongoose";
import JobOpening from "../models/jobOpening.js";
import JobApplication, { APPLICATION_STATUSES } from "../models/jobApplication.js";
import Admin from "../models/admin.js";
import Setting from "../models/setting.js";
import { isValidE164Phone, normalizePhoneNumber } from "../utils/phone.js";
import { sendEmail } from "./emailService.js";
import logger from "./logger.js";

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const STATUS_LABELS = {
  pending: "Pending",
  under_review: "Under Review",
  shortlisted: "Shortlisted",
  interview_scheduled: "Interview Scheduled",
  selected: "Selected",
  rejected: "Rejected",
};

const EMPLOYMENT_LABELS = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  flexible: "Flexible hours",
};

export class CareersError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function assertObjectId(id, what = "Record") {
  if (!mongoose.isValidObjectId(String(id || ""))) throw new CareersError(404, `${what} not found`);
}

/* ------------------------------------------------------------------ */
/* Resume storage                                                      */
/* ------------------------------------------------------------------ */

export function privateResumeDir() {
  const base = process.env.PRIVATE_MEDIA_PATH || path.join(process.cwd(), "private_uploads");
  return path.resolve(base, "resumes");
}

/** Accepts only real PDFs (checked by content, not by the file name) */
export async function saveResume(file) {
  if (!file) return null;
  if (file.size > RESUME_MAX_BYTES) throw new CareersError(400, "Resume must be 5 MB or smaller");
  const isPdf = file.buffer?.subarray(0, 5).toString("latin1") === "%PDF-";
  if (!isPdf) throw new CareersError(400, "Resume must be a PDF file");

  const dir = privateResumeDir();
  await fs.mkdir(dir, { recursive: true });
  const fileName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.pdf`;
  await fs.writeFile(path.join(dir, fileName), file.buffer, { mode: 0o640 });
  return {
    fileName,
    originalName: String(file.originalname || "resume.pdf").replace(/[^\w.\- ]+/g, "_").slice(0, 120),
    size: file.size,
    mimeType: "application/pdf",
  };
}

/** Absolute path of an application's resume, or null when there is none / it is missing */
export async function resolveResumePath(application) {
  const fileName = application?.resume?.fileName;
  if (!fileName || !/^[\w-]+\.pdf$/.test(fileName)) return null;
  const fullPath = path.join(privateResumeDir(), fileName);
  try {
    await fs.access(fullPath);
    return fullPath;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Job openings                                                        */
/* ------------------------------------------------------------------ */

export function toPublicJob(job) {
  return {
    id: String(job._id),
    title: job.title,
    description: job.description,
    responsibilities: job.responsibilities || [],
    requirements: job.requirements || [],
    location: job.location,
    employmentType: job.employmentType,
    employmentTypeLabel: EMPLOYMENT_LABELS[job.employmentType] || job.employmentType,
    salary: job.salary || "",
    openings: job.openings ?? null,
    postedAt: job.createdAt,
  };
}

export async function listActiveJobs({ search = "", location = "" } = {}) {
  const query = { isActive: true };
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    query.$or = [{ title: rx }, { description: rx }];
  }
  if (location) query.location = new RegExp(escapeRegex(location), "i");

  const [jobs, locations] = await Promise.all([
    JobOpening.find(query).sort({ sortOrder: 1, createdAt: -1 }).lean(),
    JobOpening.distinct("location", { isActive: true }),
  ]);
  return { items: jobs.map(toPublicJob), locations: locations.filter(Boolean).sort() };
}

export async function getActiveJob(id) {
  assertObjectId(id, "Job");
  const job = await JobOpening.findOne({ _id: id, isActive: true }).lean();
  if (!job) throw new CareersError(404, "This job is no longer open");
  return toPublicJob(job);
}

export async function listJobsForAdmin() {
  const [jobs, counts] = await Promise.all([
    JobOpening.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean(),
    JobApplication.aggregate([
      { $match: { job: { $ne: null } } },
      {
        $group: {
          _id: "$job",
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
        },
      },
    ]),
  ]);
  const byJob = new Map(counts.map((c) => [String(c._id), c]));
  return jobs.map((job) => ({
    ...toPublicJob(job),
    isActive: job.isActive,
    sortOrder: job.sortOrder,
    updatedAt: job.updatedAt,
    applications: byJob.get(String(job._id))?.total || 0,
    pendingApplications: byJob.get(String(job._id))?.pending || 0,
  }));
}

export async function createJob(payload, adminId) {
  const job = await JobOpening.create({ ...payload, createdBy: adminId, updatedBy: adminId });
  return job.toObject();
}

export async function updateJob(id, payload, adminId) {
  assertObjectId(id, "Job");
  const job = await JobOpening.findByIdAndUpdate(
    id,
    { $set: { ...payload, updatedBy: adminId } },
    { new: true, runValidators: true },
  ).lean();
  if (!job) throw new CareersError(404, "Job not found");
  return job;
}

/** Applications are kept (with their job title) when a listing is deleted */
export async function deleteJob(id) {
  assertObjectId(id, "Job");
  const job = await JobOpening.findByIdAndDelete(id).lean();
  if (!job) throw new CareersError(404, "Job not found");
  await JobApplication.updateMany({ job: job._id }, { $set: { job: null } });
  return job;
}

/* ------------------------------------------------------------------ */
/* Applications                                                        */
/* ------------------------------------------------------------------ */

/** "98765 43210", "+91 9876543210" -> "+919876543210"; only Indian mobile numbers */
export function normalizeApplicantPhone(raw) {
  const phone = normalizePhoneNumber(raw);
  if (!isValidE164Phone(phone) || !/^\+91[6-9]\d{9}$/.test(phone)) {
    throw new CareersError(400, "Enter a valid 10-digit Indian mobile number");
  }
  return phone;
}

async function notifyAdminOfApplication(application) {
  try {
    const settings = await Setting.findOne({}).select("supportEmail appName").lean();
    const to = process.env.CAREERS_NOTIFY_EMAIL || settings?.supportEmail;
    const appName = settings?.appName || "Zozi9";
    const rows = [
      ["Job", application.jobTitle],
      ["Name", application.fullName],
      ["Mobile", application.phone],
      ["Email", application.email || "-"],
      ["City", application.city],
      ["Experience", application.experienceType === "experienced" ? `${application.experienceYears} year(s)` : "Fresher"],
      ["Resume", application.resume?.fileName ? "Attached (view in admin panel)" : "Not provided"],
    ];
    await sendEmail({
      to,
      subject: `New job application: ${application.jobTitle} - ${application.fullName}`,
      text: `${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nOpen Admin > Careers to review.`,
      html: `<div style="font-family:Arial,sans-serif;color:#0f172a"><h3>New application on ${escapeHtml(appName)} Careers</h3><table cellpadding="4">${rows
        .map(([k, v]) => `<tr><td><b>${escapeHtml(k)}</b></td><td>${escapeHtml(v)}</td></tr>`)
        .join("")}</table><p>Open Admin &gt; Careers to review.</p></div>`,
    });
  } catch (error) {
    logger.warn("Careers admin email failed", { message: error.message });
  }
}

export async function submitApplication(input, { resumeFile = null, customerId = null, ipAddress = "" } = {}) {
  assertObjectId(input.jobId, "Job");
  const job = await JobOpening.findOne({ _id: input.jobId, isActive: true }).lean();
  if (!job) throw new CareersError(404, "This job is no longer accepting applications");

  const phone = normalizeApplicantPhone(input.phone);
  const recent = await JobApplication.exists({
    job: job._id,
    phone,
    createdAt: { $gt: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
  });
  if (recent) {
    throw new CareersError(409, "You have already applied for this job. Our team will contact you if your profile is shortlisted.");
  }

  const resume = resumeFile ? await saveResume(resumeFile) : null;
  const experienced = input.experienceType === "experienced";

  const application = await JobApplication.create({
    job: job._id,
    jobTitle: job.title,
    fullName: input.fullName,
    phone,
    email: input.email || "",
    city: input.city,
    address: input.address || "",
    experienceType: input.experienceType,
    experienceYears: experienced ? input.experienceYears || 0 : 0,
    message: input.message || "",
    ...(resume ? { resume } : {}),
    status: "pending",
    statusHistory: [{ status: "pending", byName: "Applicant" }],
    customer: customerId && mongoose.isValidObjectId(String(customerId)) ? customerId : null,
    ipAddress: String(ipAddress || "").slice(0, 64),
  });

  notifyAdminOfApplication(application); // best-effort, never delays the applicant
  return { id: String(application._id), jobTitle: job.title };
}

function toAdminApplication(app) {
  return {
    id: String(app._id),
    jobId: app.job ? String(app.job._id || app.job) : null,
    jobTitle: app.jobTitle,
    jobLocation: app.job?.location || "",
    jobDeleted: !app.job,
    fullName: app.fullName,
    phone: app.phone,
    email: app.email,
    city: app.city,
    address: app.address,
    experienceType: app.experienceType,
    experienceYears: app.experienceYears,
    message: app.message,
    hasResume: !!app.resume?.fileName,
    resumeName: app.resume?.originalName || "",
    resumeSize: app.resume?.size || 0,
    status: app.status,
    statusLabel: STATUS_LABELS[app.status] || app.status,
    statusHistory: app.statusHistory || [],
    interviewAt: app.interviewAt,
    notes: (app.notes || []).map((n) => ({ id: String(n._id), text: n.text, byName: n.byName, at: n.at })),
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

export async function listApplications({ jobId, status, location, search, from, to, page = 1, limit = 20 }) {
  const query = {};
  if (jobId === "deleted") query.job = null;
  else if (jobId && mongoose.isValidObjectId(jobId)) query.job = jobId;
  if (status && APPLICATION_STATUSES.includes(status)) query.status = status;
  if (location) query.city = new RegExp(escapeRegex(location), "i");
  if (search) {
    const term = String(search).trim();
    const digits = term.replace(/\D/g, "");
    query.$or = [
      { fullName: new RegExp(escapeRegex(term), "i") },
      ...(digits.length >= 3 ? [{ phone: new RegExp(escapeRegex(digits)) }] : []),
    ];
  }
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(`${from}T00:00:00+05:30`);
    if (to) query.createdAt.$lte = new Date(`${to}T23:59:59.999+05:30`);
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const [items, total] = await Promise.all([
    JobApplication.find(query)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .populate("job", "location")
      .lean(),
    JobApplication.countDocuments(query),
  ]);
  return {
    items: items.map(toAdminApplication),
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.ceil(total / safeLimit) || 1,
  };
}

export async function getApplication(id) {
  assertObjectId(id, "Application");
  const app = await JobApplication.findById(id).populate("job", "location").lean();
  if (!app) throw new CareersError(404, "Application not found");
  return toAdminApplication(app);
}

export async function getApplicationResume(id) {
  assertObjectId(id, "Application");
  const app = await JobApplication.findById(id).select("resume fullName").lean();
  if (!app) throw new CareersError(404, "Application not found");
  const filePath = await resolveResumePath(app);
  if (!filePath) throw new CareersError(404, "No resume was uploaded with this application");
  const safeName = `${String(app.fullName || "applicant").replace(/[^\w-]+/g, "_")}-resume.pdf`;
  return { filePath, downloadName: safeName };
}

async function adminName(adminId) {
  if (!adminId || !mongoose.isValidObjectId(String(adminId))) return "Admin";
  const admin = await Admin.findById(adminId).select("name").lean();
  return admin?.name || "Admin";
}

async function notifyApplicantOfStatus(app) {
  if (!app.email || !["shortlisted", "interview_scheduled", "selected"].includes(app.status)) {
    return { emailed: false };
  }
  try {
    const settings = await Setting.findOne({}).select("appName supportPhone supportEmail").lean();
    const appName = settings?.appName || "Zozi9";
    const when = app.interviewAt
      ? new Date(app.interviewAt).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Kolkata" })
      : "";
    const lines = {
      shortlisted: `Good news! Your application for ${app.jobTitle} at ${appName} has been shortlisted. Our team will contact you soon with the next steps.`,
      interview_scheduled: `Your interview for ${app.jobTitle} at ${appName} has been scheduled${when ? ` for ${when}` : ""}. Our team will contact you with the details.`,
      selected: `Congratulations! You have been selected for ${app.jobTitle} at ${appName}. Our team will contact you about joining.`,
    };
    const contact = [settings?.supportPhone, settings?.supportEmail].filter(Boolean).join(" / ");
    const text = `Hi ${app.fullName},\n\n${lines[app.status]}${contact ? `\n\nQuestions? Contact us at ${contact}.` : ""}\n\nTeam ${appName}`;
    const result = await sendEmail({
      to: app.email,
      subject: `${appName} Careers: ${STATUS_LABELS[app.status]}`,
      text,
      html: `<div style="font-family:Arial,sans-serif;color:#0f172a;white-space:pre-line">${escapeHtml(text)}</div>`,
    });
    return { emailed: !!result.delivered };
  } catch (error) {
    logger.warn("Careers applicant email failed", { message: error.message });
    return { emailed: false };
  }
}

export async function updateApplicationStatus(id, { status, interviewAt = null, notify = true }, adminId) {
  assertObjectId(id, "Application");
  const app = await JobApplication.findById(id);
  if (!app) throw new CareersError(404, "Application not found");

  const changed = app.status !== status;
  const byName = await adminName(adminId);
  app.status = status;
  if (status === "interview_scheduled") app.interviewAt = interviewAt || app.interviewAt || null;
  if (changed) app.statusHistory.push({ status, by: adminId, byName });
  await app.save();

  const notification = changed && notify ? await notifyApplicantOfStatus(app) : { emailed: false };
  const view = await getApplication(id);
  return { ...view, notification };
}

export async function addApplicationNote(id, text, adminId) {
  assertObjectId(id, "Application");
  const byName = await adminName(adminId);
  const app = await JobApplication.findByIdAndUpdate(
    id,
    { $push: { notes: { text, by: adminId, byName, at: new Date() } } },
    { new: true },
  );
  if (!app) throw new CareersError(404, "Application not found");
  return getApplication(id);
}

export async function getCareersStats() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [byStatus, lastWeek, jobs] = await Promise.all([
    JobApplication.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    JobApplication.countDocuments({ createdAt: { $gte: since } }),
    JobOpening.aggregate([{ $group: { _id: "$isActive", n: { $sum: 1 } } }]),
  ]);
  const statusCounts = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0]));
  for (const row of byStatus) statusCounts[row._id] = row.n;
  const activeJobs = jobs.find((j) => j._id === true)?.n || 0;
  const inactiveJobs = jobs.find((j) => j._id === false)?.n || 0;
  return {
    totalApplications: Object.values(statusCounts).reduce((a, b) => a + b, 0),
    lastWeekApplications: lastWeek,
    statusCounts,
    activeJobs,
    totalJobs: activeJobs + inactiveJobs,
  };
}
