/**
 * Integration check for Careers against a REAL MongoDB, through the real HTTP routes.
 *
 * It never touches your real data: it uses a throw-away database named
 * `careers_verify_<timestamp>` and a temporary resume folder, and deletes both when finished.
 *
 *   node scripts/verify-careers-integration.mjs
 */
import fs from "fs";
import os from "os";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

dotenv.config();

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("MONGO_URI is not set");
  process.exit(1);
}
const dbName = `careers_verify_${Date.now()}`;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "careers-verify-"));
process.env.PRIVATE_MEDIA_PATH = tmpDir;
process.env.SMTP_HOST = ""; // never send real email from a test
process.env.JWT_SECRET = process.env.JWT_SECRET || "verify-secret";

let passed = 0;
let failed = 0;
const check = (name, condition, extra = "") => {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name} ${extra}`);
  }
};

await mongoose.connect(uri, { dbName });
console.log(`Connected. Using temporary database: ${dbName}\n`);

const { careersPublicRouter, careersAdminRouter } = await import("../app/routes/careersRoutes.js");
const { default: Admin } = await import("../app/models/admin.js");
const { default: JobOpening } = await import("../app/models/jobOpening.js");
const { default: JobApplication } = await import("../app/models/jobApplication.js");

const app = express();
app.set("trust proxy", true);
app.use(express.json());
app.use("/api/careers", careersPublicRouter);
app.use("/api/admin/careers", careersAdminRouter);

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
let ipCounter = 10;
const nextIp = () => `10.0.0.${ipCounter++}`; // the apply limiter allows 5 per IP per hour

try {
  for (const model of [JobOpening, JobApplication]) {
    await model.createCollection().catch(() => {});
    await model.syncIndexes();
  }
  const adminId = new mongoose.Types.ObjectId();
  await Admin.collection.insertOne({ _id: adminId, name: "Test Admin", email: "verify@example.com" });
  const adminToken = jwt.sign({ id: String(adminId), role: "admin" }, process.env.JWT_SECRET);
  const customerToken = jwt.sign({ id: String(new mongoose.Types.ObjectId()), role: "customer" }, process.env.JWT_SECRET);
  const asAdmin = (r) => r.set("Authorization", `Bearer ${adminToken}`);

  console.log("Admin: job openings");
  let res = await request(app).post("/api/admin/careers/jobs").send({ title: "X", location: "Y", employmentType: "full_time" });
  check("no token -> rejected", res.status === 401, String(res.status));
  res = await request(app).post("/api/admin/careers/jobs").set("Authorization", `Bearer ${customerToken}`).send({});
  check("customer token -> forbidden", res.status === 403, String(res.status));
  res = await asAdmin(request(app).post("/api/admin/careers/jobs")).send({ title: "", location: "", employmentType: "nope" });
  check("invalid job -> 400", res.status === 400, res.body.message);

  const created = {};
  for (const [title, employmentType] of [["Delivery Partner", "flexible"], ["Store Manager", "full_time"], ["Store Helper", "full_time"]]) {
    res = await asAdmin(request(app).post("/api/admin/careers/jobs")).send({
      title,
      location: "Samba, Jammu & Kashmir",
      employmentType,
      description: `${title} role`,
      responsibilities: ["Do the work"],
      requirements: ["A smartphone"],
    });
    created[title] = res.body.result?._id;
  }
  check("three jobs created", Object.values(created).every(Boolean));

  res = await asAdmin(request(app).put(`/api/admin/careers/jobs/${created["Store Manager"]}`)).send({
    title: "Store Manager",
    location: "Jammu",
    employmentType: "full_time",
    salary: "₹20,000 / month",
  });
  check("job edited", res.status === 200 && res.body.result?.location === "Jammu" && res.body.result?.salary === "₹20,000 / month");
  res = await asAdmin(request(app).patch(`/api/admin/careers/jobs/${created["Store Helper"]}/active`)).send({ isActive: false });
  check("job deactivated", res.status === 200 && res.body.result?.isActive === false);

  console.log("\nPublic: listings");
  res = await request(app).get("/api/careers/jobs");
  const titles = (res.body.result?.items || []).map((j) => j.title);
  check("only active jobs are listed", res.status === 200 && titles.length === 2 && !titles.includes("Store Helper"), JSON.stringify(titles));
  check("locations list", JSON.stringify(res.body.result?.locations) === JSON.stringify(["Jammu", "Samba, Jammu & Kashmir"]));
  res = await request(app).get("/api/careers/jobs").query({ search: "deliv" });
  check("search by role", res.body.result?.items?.length === 1);
  res = await request(app).get(`/api/careers/jobs/${created["Store Helper"]}`);
  check("hidden job detail -> 404", res.status === 404);

  console.log("\nPublic: applying");
  const apply = (fields, file) => {
    const r = request(app).post("/api/careers/applications").set("X-Forwarded-For", nextIp());
    for (const [k, v] of Object.entries(fields)) r.field(k, String(v));
    if (file) r.attach("resume", file.buffer, { filename: file.name, contentType: file.type });
    return r;
  };
  const base = {
    jobId: created["Delivery Partner"],
    fullName: "Ravi Kumar",
    phone: "98765 43210",
    city: "Samba",
    experienceType: "experienced",
    experienceYears: 2,
  };

  res = await apply({ ...base, phone: "12345" });
  check("bad mobile -> 400", res.status === 400, res.body.message);
  res = await apply({ ...base, experienceYears: "" });
  check("experienced without years -> 400", res.status === 400, res.body.message);
  res = await apply(base, { buffer: Buffer.from("not a pdf"), name: "cv.pdf", type: "application/pdf" });
  check("fake PDF -> 400", res.status === 400 && /PDF/.test(res.body.message), res.body.message);
  res = await apply(base, { buffer: Buffer.from("x"), name: "cv.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  check("non-PDF type -> 400", res.status === 400, res.body.message);
  res = await apply(base, { buffer: Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]), name: "big.pdf", type: "application/pdf" });
  check("over 5 MB -> 400", res.status === 400 && /5 MB/.test(res.body.message), res.body.message);
  res = await apply({ ...base, jobId: created["Store Helper"] });
  check("hidden job -> 404", res.status === 404, res.body.message);

  res = await apply(base, { buffer: PDF, name: "Ravi CV.pdf", type: "application/pdf" });
  check("valid application with resume -> 201", res.status === 201, `${res.status} ${res.body.message}`);
  check("confirmation message", /submitted successfully/.test(res.body.message || ""));
  const appId = res.body.result?.id;

  res = await apply(base);
  check("same phone + job within 24h -> 409", res.status === 409, res.body.message);

  res = await apply({ ...base, jobId: created["Store Manager"], fullName: "Asha Devi", phone: "+91 91234 56789", experienceType: "fresher", experienceYears: 7, email: "asha@example.com" });
  check("fresher application without resume -> 201", res.status === 201, res.body.message);
  const ashaId = res.body.result?.id;
  const asha = await JobApplication.findById(ashaId).lean();
  check("fresher years ignored, phone normalised", asha.experienceYears === 0 && asha.phone === "+919123456789", JSON.stringify(asha.phone));

  res = await apply({ ...base, phone: "9000000001", website: "http://spam" });
  check("honeypot -> fake success, nothing stored", res.status === 201 && !(await JobApplication.exists({ phone: "+919000000001" })));

  const stored = await JobApplication.findById(appId).lean();
  check("resume stored privately", !!stored.resume?.fileName && fs.existsSync(path.join(tmpDir, "resumes", stored.resume.fileName)));
  check("resume not under public uploads", !stored.resume.fileName.includes("/") && !fs.existsSync(path.join("uploads", stored.resume.fileName)));

  console.log("\nAdmin: applications");
  res = await request(app).get(`/api/admin/careers/applications/${appId}/resume`);
  check("resume without token -> 401", res.status === 401);
  res = await asAdmin(request(app).get(`/api/admin/careers/applications/${appId}/resume`)).buffer(true);
  check("admin downloads resume as PDF", res.status === 200 && res.headers["content-type"] === "application/pdf" && Buffer.from(res.body).subarray(0, 5).toString() === "%PDF-");
  check("resume is not cached publicly", /private/.test(res.headers["cache-control"] || ""));
  res = await asAdmin(request(app).get(`/api/admin/careers/applications/${ashaId}/resume`));
  check("no resume -> 404", res.status === 404);

  res = await asAdmin(request(app).get("/api/admin/careers/applications"));
  check("list all", res.body.result?.total === 2, JSON.stringify(res.body.result?.total));
  res = await asAdmin(request(app).get("/api/admin/careers/applications").query({ search: "43210" }));
  check("search by mobile", res.body.result?.total === 1 && res.body.result.items[0].fullName === "Ravi Kumar");
  res = await asAdmin(request(app).get("/api/admin/careers/applications").query({ search: "asha" }));
  check("search by name", res.body.result?.total === 1);
  res = await asAdmin(request(app).get("/api/admin/careers/applications").query({ jobId: created["Store Manager"] }));
  check("filter by job", res.body.result?.total === 1);
  res = await asAdmin(request(app).get("/api/admin/careers/applications").query({ location: "samba" }));
  check("filter by location", res.body.result?.total === 2);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  res = await asAdmin(request(app).get("/api/admin/careers/applications").query({ from: today, to: today }));
  check("filter by date", res.body.result?.total === 2);
  res = await asAdmin(request(app).get("/api/admin/careers/applications").query({ from: "2000-01-01", to: "2000-01-02" }));
  check("filter by old date -> none", res.body.result?.total === 0);

  res = await asAdmin(request(app).patch(`/api/admin/careers/applications/${ashaId}/status`)).send({ status: "interview_scheduled", interviewAt: "2026-11-02T05:30:00.000Z" });
  check("status -> interview scheduled", res.status === 200 && res.body.result?.status === "interview_scheduled" && !!res.body.result?.interviewAt);
  check("history records the admin", res.body.result?.statusHistory?.at(-1)?.byName === "Test Admin");
  res = await asAdmin(request(app).patch(`/api/admin/careers/applications/${ashaId}/status`)).send({ status: "maybe" });
  check("invalid status -> 400", res.status === 400);
  res = await asAdmin(request(app).get("/api/admin/careers/applications").query({ status: "interview_scheduled" }));
  check("filter by status", res.body.result?.total === 1);

  res = await asAdmin(request(app).post(`/api/admin/careers/applications/${ashaId}/notes`)).send({ text: "Called, interview on Monday" });
  check("internal note added", res.status === 200 && res.body.result?.notes?.[0]?.text === "Called, interview on Monday" && res.body.result.notes[0].byName === "Test Admin");

  res = await asAdmin(request(app).get("/api/admin/careers/stats"));
  const s = res.body.result || {};
  check("stats", s.totalApplications === 2 && s.statusCounts?.pending === 1 && s.statusCounts?.interview_scheduled === 1 && s.activeJobs === 2 && s.totalJobs === 3, JSON.stringify(s));
  res = await asAdmin(request(app).get("/api/admin/careers/jobs"));
  const dp = (res.body.results || []).find((j) => j.title === "Delivery Partner");
  check("job list shows application counts", dp?.applications === 1 && dp?.pendingApplications === 1, JSON.stringify({ status: res.status, dp }));

  res = await asAdmin(request(app).delete(`/api/admin/careers/jobs/${created["Delivery Partner"]}`));
  check("job deleted", res.status === 200);
  const orphan = await JobApplication.findById(appId).lean();
  check("its application is kept with the job title", orphan && orphan.job === null && orphan.jobTitle === "Delivery Partner");
  res = await asAdmin(request(app).get("/api/admin/careers/applications").query({ jobId: "deleted" }));
  check("filter deleted listings", res.body.result?.total === 1);
} catch (error) {
  failed += 1;
  console.error("\nUnexpected error:", error);
} finally {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\nDropped ${dbName} and the temporary resume folder`);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
