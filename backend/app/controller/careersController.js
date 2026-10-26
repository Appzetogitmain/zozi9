import handleResponse from "../utils/helper.js";
import {
  addApplicationNote,
  createJob,
  deleteJob,
  getActiveJob,
  getApplication,
  getApplicationResume,
  getCareersStats,
  listActiveJobs,
  listApplications,
  listJobsForAdmin,
  submitApplication,
  updateApplicationStatus,
  updateJob,
} from "../services/careersService.js";
import {
  applicationSchema,
  jobActiveSchema,
  jobSchema,
  listApplicationsQuerySchema,
  noteSchema,
  publicJobsQuerySchema,
  statusSchema,
} from "../validation/careersValidation.js";

function validate(schema, payload) {
  const { error, value } = schema.validate(payload || {}, { abortEarly: false, stripUnknown: true });
  if (error) {
    const err = new Error(error.details.map((d) => d.message.replace(/"/g, "")).join("; "));
    err.statusCode = 400;
    throw err;
  }
  return value;
}

const fail = (res, error) => {
  if ((error.statusCode || 500) >= 500) console.error("[careers] error:", error);
  return handleResponse(res, error.statusCode || 500, error.statusCode ? error.message : "Something went wrong. Please try again.");
};

/* ===============================
   PUBLIC
================================ */

export const getJobs = async (req, res) => {
  try {
    const query = validate(publicJobsQuerySchema, req.query);
    return handleResponse(res, 200, "Jobs fetched", await listActiveJobs(query));
  } catch (error) {
    return fail(res, error);
  }
};

export const getJob = async (req, res) => {
  try {
    return handleResponse(res, 200, "Job fetched", await getActiveJob(req.params.id));
  } catch (error) {
    return fail(res, error);
  }
};

export const applyForJob = async (req, res) => {
  try {
    const payload = validate(applicationSchema, req.body);
    // Bots fill every field; pretend success so they do not retry
    if (payload.website) return handleResponse(res, 201, "Application submitted", { id: null });
    const result = await submitApplication(payload, {
      resumeFile: req.file || null,
      customerId: req.user?.role === "customer" || req.user?.role === "user" ? req.user.id : null,
      ipAddress: req.ip,
    });
    return handleResponse(
      res,
      201,
      "Your application has been submitted successfully. Our team will contact you if your profile is shortlisted.",
      result,
    );
  } catch (error) {
    return fail(res, error);
  }
};

/* ===============================
   ADMIN
================================ */

export const adminListJobs = async (_req, res) => {
  try {
    return handleResponse(res, 200, "Jobs fetched", await listJobsForAdmin());
  } catch (error) {
    return fail(res, error);
  }
};

export const adminCreateJob = async (req, res) => {
  try {
    const payload = validate(jobSchema, req.body);
    return handleResponse(res, 201, "Job created", await createJob(payload, req.user.id));
  } catch (error) {
    return fail(res, error);
  }
};

export const adminUpdateJob = async (req, res) => {
  try {
    const payload = validate(jobSchema, req.body);
    return handleResponse(res, 200, "Job updated", await updateJob(req.params.id, payload, req.user.id));
  } catch (error) {
    return fail(res, error);
  }
};

export const adminSetJobActive = async (req, res) => {
  try {
    const { isActive } = validate(jobActiveSchema, req.body);
    const job = await updateJob(req.params.id, { isActive }, req.user.id);
    return handleResponse(res, 200, isActive ? "Job is now live" : "Job hidden from the careers page", job);
  } catch (error) {
    return fail(res, error);
  }
};

export const adminDeleteJob = async (req, res) => {
  try {
    await deleteJob(req.params.id);
    return handleResponse(res, 200, "Job deleted. Its applications are kept.", { id: req.params.id });
  } catch (error) {
    return fail(res, error);
  }
};

export const adminListApplications = async (req, res) => {
  try {
    const query = validate(listApplicationsQuerySchema, req.query);
    return handleResponse(res, 200, "Applications fetched", await listApplications(query));
  } catch (error) {
    return fail(res, error);
  }
};

export const adminGetApplication = async (req, res) => {
  try {
    return handleResponse(res, 200, "Application fetched", await getApplication(req.params.id));
  } catch (error) {
    return fail(res, error);
  }
};

export const adminUpdateStatus = async (req, res) => {
  try {
    const payload = validate(statusSchema, req.body);
    const result = await updateApplicationStatus(req.params.id, payload, req.user.id);
    const emailed = result.notification?.emailed ? " The applicant was emailed." : "";
    return handleResponse(res, 200, `Status updated to ${result.statusLabel}.${emailed}`, result);
  } catch (error) {
    return fail(res, error);
  }
};

export const adminAddNote = async (req, res) => {
  try {
    const { text } = validate(noteSchema, req.body);
    return handleResponse(res, 200, "Note added", await addApplicationNote(req.params.id, text, req.user.id));
  } catch (error) {
    return fail(res, error);
  }
};

/** Streams the PDF; never exposed as a public static file */
export const adminDownloadResume = async (req, res) => {
  try {
    const { filePath, downloadName } = await getApplicationResume(req.params.id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${downloadName}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.sendFile(filePath);
  } catch (error) {
    return fail(res, error);
  }
};

export const adminStats = async (_req, res) => {
  try {
    return handleResponse(res, 200, "Careers stats fetched", await getCareersStats());
  } catch (error) {
    return fail(res, error);
  }
};
