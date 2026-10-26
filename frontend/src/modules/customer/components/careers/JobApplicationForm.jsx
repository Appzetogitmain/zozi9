import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, FileText, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@core/context/AuthContext";
import { customerApi } from "../../services/customerApi";

const RESUME_MAX_BYTES = 5 * 1024 * 1024;
const SUCCESS_MESSAGE =
  "Your application has been submitted successfully. Our team will contact you if your profile is shortlisted.";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10 aria-[invalid=true]:border-red-400 aria-[invalid=true]:bg-red-50/40";

const onlyDigits = (value) => String(value || "").replace(/\D/g, "");
const tenDigitMobile = (value) => {
  const digits = onlyDigits(value);
  return digits.length > 10 && digits.startsWith("91") ? digits.slice(-10) : digits.slice(0, 10);
};

function validate(form, resume) {
  const errors = {};
  if (!form.jobId) errors.jobId = "Choose a job role";
  if (form.fullName.trim().length < 2) errors.fullName = "Enter your full name";
  else if (!/^[\p{L} .'-]+$/u.test(form.fullName.trim())) errors.fullName = "Use letters only";
  if (!/^[6-9]\d{9}$/.test(form.phone)) errors.phone = "Enter a valid 10-digit mobile number";
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) errors.email = "Enter a valid email or leave it empty";
  if (form.city.trim().length < 2) errors.city = "Enter your city or preferred location";
  if (!form.experienceType) errors.experienceType = "Choose one";
  if (form.experienceType === "experienced") {
    const years = Number(form.experienceYears);
    if (!form.experienceYears || !Number.isFinite(years) || years < 0.5 || years > 50) {
      errors.experienceYears = "Enter years of experience (0.5 - 50)";
    }
  }
  if (resume && resume.size > RESUME_MAX_BYTES) errors.resume = "Resume must be 5 MB or smaller";
  if (form.message.length > 1000) errors.message = "Keep the message under 1000 characters";
  return errors;
}

const Field = ({ id, label, required, error, hint, children }) => (
  <div className="space-y-1.5">
    <label htmlFor={id} className="block text-xs font-bold text-slate-700">
      {label} {required ? <span className="text-red-500">*</span> : <span className="font-medium text-slate-400">(optional)</span>}
    </label>
    {children}
    {error ? (
      <p id={`${id}-error`} className="text-xs font-semibold text-red-600">{error}</p>
    ) : (
      hint && <p className="text-[11px] font-medium text-slate-400">{hint}</p>
    )}
  </div>
);

/** Apply Now form in a bottom sheet (mobile) / dialog (desktop) */
const JobApplicationForm = ({ open, jobs, initialJobId, onClose }) => {
  const { user } = useAuth();
  const [form, setForm] = useState(null);
  const [resume, setResume] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [serverError, setServerError] = useState("");
  const [done, setDone] = useState(false);
  const fileRef = useRef(null);
  const firstFieldRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      jobId: initialJobId || "",
      fullName: user?.name && user.name !== "Customer" ? user.name : "",
      phone: tenDigitMobile(user?.phone),
      email: user?.email || "",
      city: "",
      address: "",
      experienceType: "",
      experienceYears: "",
      message: "",
      website: "", // honeypot
    });
    setResume(null);
    setErrors({});
    setServerError("");
    setDone(false);
    setProgress(0);
    // Prefill only when the form opens; a profile refresh must not wipe what was typed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialJobId]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && !submitting && onClose();
    window.addEventListener("keydown", onKey);
    setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, submitting, onClose]);

  if (!open || !form) return null;

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      Object.keys(patch).forEach((k) => delete next[k]);
      return next;
    });
  };

  const pickResume = (file) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      setErrors((e) => ({ ...e, resume: "Upload your resume as a PDF file" }));
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > RESUME_MAX_BYTES) {
      setErrors((e) => ({ ...e, resume: "Resume must be 5 MB or smaller" }));
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setResume(file);
    setErrors((e) => ({ ...e, resume: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setServerError("");
    const found = validate(form, resume);
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(`apply-${Object.keys(found)[0]}`)?.focus();
      return;
    }

    const data = new FormData();
    Object.entries({
      ...form,
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      city: form.city.trim(),
      address: form.address.trim(),
      message: form.message.trim(),
    }).forEach(([key, value]) => {
      if (key === "experienceYears" && form.experienceType !== "experienced") return;
      data.append(key, value);
    });
    if (resume) data.append("resume", resume);

    setSubmitting(true);
    try {
      await customerApi.applyForJob(data, (evt) => {
        if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
      });
      setDone(true);
    } catch (err) {
      setServerError(
        err.response?.data?.message ||
          (err.code === "ECONNABORTED" ? "The upload took too long. Please try again." : "Could not submit your application. Please try again."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectedJob = jobs.find((j) => j.id === form.jobId);
  const describe = (key) => (errors[key] ? { "aria-invalid": true, "aria-describedby": `apply-${key}-error` } : {});

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl supports-[height:100dvh]:max-h-[94dvh] sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="apply-title" className="text-lg font-black text-slate-900">
              {done ? "Application submitted" : "Apply for a job"}
            </h2>
            {!done && selectedJob && (
              <p className="text-xs font-semibold text-slate-500">
                {selectedJob.title} · {selectedJob.location}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={34} />
            </div>
            <p role="status" className="mx-auto max-w-sm text-sm font-semibold leading-relaxed text-slate-700">
              {SUCCESS_MESSAGE}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-xl bg-primary px-8 py-3 text-sm font-black text-white shadow-lg shadow-primary/20"
            >
              Done
            </button>
          </div>
        ) : (
          <form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <Field id="apply-jobId" label="Job role" required error={errors.jobId}>
                <select
                  id="apply-jobId"
                  value={form.jobId}
                  onChange={(e) => set({ jobId: e.target.value })}
                  className={inputClass}
                  {...describe("jobId")}
                >
                  <option value="">Select a role</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} · {j.location}
                    </option>
                  ))}
                </select>
              </Field>

              <Field id="apply-fullName" label="Full name" required error={errors.fullName}>
                <input
                  ref={firstFieldRef}
                  id="apply-fullName"
                  value={form.fullName}
                  onChange={(e) => set({ fullName: e.target.value })}
                  autoComplete="name"
                  maxLength={100}
                  className={inputClass}
                  {...describe("fullName")}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="apply-phone" label="Mobile number" required error={errors.phone}>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">+91</span>
                    <input
                      id="apply-phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      value={form.phone}
                      onChange={(e) => set({ phone: tenDigitMobile(e.target.value) })}
                      className={cn(inputClass, "pl-12")}
                      {...describe("phone")}
                    />
                  </div>
                </Field>
                <Field id="apply-email" label="Email address" error={errors.email}>
                  <input
                    id="apply-email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => set({ email: e.target.value })}
                    maxLength={120}
                    className={inputClass}
                    {...describe("email")}
                  />
                </Field>
              </div>

              <Field id="apply-city" label="City / preferred location" required error={errors.city}>
                <input
                  id="apply-city"
                  value={form.city}
                  onChange={(e) => set({ city: e.target.value })}
                  autoComplete="address-level2"
                  maxLength={100}
                  placeholder="E.g. Samba"
                  className={inputClass}
                  {...describe("city")}
                />
              </Field>

              <Field id="apply-address" label="Full address" error={errors.address}>
                <textarea
                  id="apply-address"
                  rows={2}
                  value={form.address}
                  onChange={(e) => set({ address: e.target.value })}
                  autoComplete="street-address"
                  maxLength={500}
                  className={cn(inputClass, "resize-none")}
                />
              </Field>

              <fieldset className="space-y-1.5">
                <legend className="text-xs font-bold text-slate-700">
                  Experience <span className="text-red-500">*</span>
                </legend>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" id="apply-experienceType" tabIndex={-1}>
                  {[
                    { id: "fresher", label: "Fresher" },
                    { id: "experienced", label: "Experienced" },
                  ].map((opt) => (
                    <label
                      key={opt.id}
                      className={cn(
                        "flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition",
                        form.experienceType === opt.id
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300",
                      )}
                    >
                      <input
                        type="radio"
                        name="experienceType"
                        value={opt.id}
                        checked={form.experienceType === opt.id}
                        onChange={() => set({ experienceType: opt.id })}
                        className="sr-only"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                {errors.experienceType && <p className="text-xs font-semibold text-red-600">{errors.experienceType}</p>}
              </fieldset>

              {form.experienceType === "experienced" && (
                <Field id="apply-experienceYears" label="Years of experience" required error={errors.experienceYears}>
                  <input
                    id="apply-experienceYears"
                    type="number"
                    inputMode="decimal"
                    min="0.5"
                    max="50"
                    step="0.5"
                    value={form.experienceYears}
                    onChange={(e) => set({ experienceYears: e.target.value })}
                    className={inputClass}
                    {...describe("experienceYears")}
                  />
                </Field>
              )}

              <Field id="apply-resume" label="Resume" error={errors.resume} hint="PDF only, up to 5 MB">
                <input
                  ref={fileRef}
                  id="apply-resume"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => pickResume(e.target.files?.[0])}
                  className="sr-only"
                />
                {resume ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-700">
                      <FileText size={18} className="shrink-0 text-primary" />
                      <span className="truncate">{resume.name}</span>
                      <span className="shrink-0 text-xs text-slate-400">{(resume.size / 1024 / 1024).toFixed(1)} MB</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setResume(null);
                        if (fileRef.current) fileRef.current.value = "";
                      }}
                      className="shrink-0 text-xs font-bold text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <label
                    htmlFor="apply-resume"
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-500 transition hover:border-primary/40 hover:text-primary"
                  >
                    <Upload size={18} /> Upload resume (PDF)
                  </label>
                )}
              </Field>

              <Field id="apply-message" label="Message" error={errors.message}>
                <textarea
                  id="apply-message"
                  rows={3}
                  value={form.message}
                  onChange={(e) => set({ message: e.target.value })}
                  maxLength={1000}
                  placeholder="Anything you'd like us to know"
                  className={cn(inputClass, "resize-none")}
                />
              </Field>

              {/* Honeypot for bots: hidden from people and screen readers */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={form.website}
                onChange={(e) => set({ website: e.target.value })}
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
              />

              {serverError && (
                <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                  {serverError}
                </p>
              )}
            </div>

            <div className="shrink-0 border-t border-slate-100 bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-primary/25 transition enabled:active:scale-[0.99] disabled:opacity-70"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    {resume && progress > 0 && progress < 100 ? `Uploading ${progress}%` : "Submitting..."}
                  </>
                ) : (
                  "Submit application"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default JobApplicationForm;
