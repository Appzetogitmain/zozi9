import express from "express";
import multer from "multer";
import { verifyToken, optionalVerifyToken, allowRoles } from "../middleware/authMiddleware.js";
import { byIp, createRateLimiter } from "../middleware/rateLimiter.js";
import { RESUME_MAX_BYTES } from "../services/careersService.js";
import {
  getJobs,
  getJob,
  applyForJob,
  adminListJobs,
  adminCreateJob,
  adminUpdateJob,
  adminSetJobActive,
  adminDeleteJob,
  adminListApplications,
  adminGetApplication,
  adminUpdateStatus,
  adminAddNote,
  adminDownloadResume,
  adminStats,
} from "../controller/careersController.js";
import handleResponse from "../utils/helper.js";

// Resumes stay in memory until validated, then go to the private folder
const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RESUME_MAX_BYTES, files: 1, fields: 20 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") return cb(null, true);
    const err = new Error("Resume must be a PDF file");
    err.statusCode = 400;
    return cb(err);
  },
}).single("resume");

const handleResumeUpload = (req, res, next) =>
  resumeUpload(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return handleResponse(res, 400, "Resume must be 5 MB or smaller");
    return handleResponse(res, err.statusCode || 400, err.message || "Could not read the uploaded file");
  });

// Application spam guard: 5 applications per hour per IP
const applyLimiter = createRateLimiter({
  namespace: "careers_apply",
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: byIp,
  message: "Too many applications from this network. Please try again later.",
});

/* ---------------- Public: mounted at /api/careers ---------------- */
export const careersPublicRouter = express.Router();
careersPublicRouter.get("/jobs", getJobs);
careersPublicRouter.get("/jobs/:id", getJob);
careersPublicRouter.post("/applications", applyLimiter, optionalVerifyToken, handleResumeUpload, applyForJob);

/* ---------------- Admin: mounted at /api/admin/careers ---------------- */
export const careersAdminRouter = express.Router();
careersAdminRouter.use(verifyToken, allowRoles("admin"));

careersAdminRouter.get("/stats", adminStats);
careersAdminRouter.get("/jobs", adminListJobs);
careersAdminRouter.post("/jobs", adminCreateJob);
careersAdminRouter.put("/jobs/:id", adminUpdateJob);
careersAdminRouter.patch("/jobs/:id/active", adminSetJobActive);
careersAdminRouter.delete("/jobs/:id", adminDeleteJob);

careersAdminRouter.get("/applications", adminListApplications);
careersAdminRouter.get("/applications/:id", adminGetApplication);
careersAdminRouter.patch("/applications/:id/status", adminUpdateStatus);
careersAdminRouter.post("/applications/:id/notes", adminAddNote);
careersAdminRouter.get("/applications/:id/resume", adminDownloadResume);
