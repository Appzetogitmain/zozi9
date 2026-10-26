import React, { useEffect, useState } from "react";
import Card from "@shared/components/ui/Card";
import Modal from "@shared/components/ui/Modal";
import { useToast } from "@shared/components/ui/Toast";
import { HiOutlinePencilSquare, HiOutlineTrash, HiOutlineMapPin, HiOutlineBriefcase } from "react-icons/hi2";
import { cn } from "@/lib/utils";
import { adminApi } from "../../services/adminApi";
import { EMPLOYMENT_TYPES, Field } from "./careersShared";

const EMPTY_JOB = {
  title: "",
  location: "",
  employmentType: "full_time",
  salary: "",
  openings: "",
  sortOrder: 0,
  description: "",
  responsibilities: "",
  requirements: "",
  isActive: true,
};

// Lists are edited one item per line
const toLines = (list = []) => list.join("\n");
const fromLines = (text) =>
  String(text || "")
    .split("\n")
    .map((l) => l.replace(/^[\s•\-*]+/, "").trim())
    .filter(Boolean);

const Switch = ({ checked, onChange, disabled, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50", checked ? "bg-primary" : "bg-slate-300")}
  >
    <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-6" : "left-1")} />
  </button>
);

export const JobFormModal = ({ job, isOpen, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY_JOB);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(
      job
        ? {
            title: job.title,
            location: job.location,
            employmentType: job.employmentType,
            salary: job.salary || "",
            openings: job.openings ?? "",
            sortOrder: job.sortOrder ?? 0,
            description: job.description || "",
            responsibilities: toLines(job.responsibilities),
            requirements: toLines(job.requirements),
            isActive: job.isActive,
          }
        : EMPTY_JOB,
    );
  }, [isOpen, job]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (form.title.trim().length < 2 || form.location.trim().length < 2) {
      showToast("Job title and location are required", "error");
      return;
    }
    const payload = {
      title: form.title.trim(),
      location: form.location.trim(),
      employmentType: form.employmentType,
      salary: form.salary.trim(),
      openings: form.openings === "" ? null : Number(form.openings),
      sortOrder: Number(form.sortOrder) || 0,
      description: form.description.trim(),
      responsibilities: fromLines(form.responsibilities),
      requirements: fromLines(form.requirements),
      isActive: form.isActive,
    };
    setSaving(true);
    try {
      if (job) await adminApi.updateCareerJob(job.id, payload);
      else await adminApi.createCareerJob(payload);
      showToast(job ? "Job updated" : "Job created", "success");
      onSaved();
      onClose();
    } catch (e) {
      showToast(e.response?.data?.message || "Could not save the job", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={job ? "Edit job opening" : "New job opening"}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-black text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : job ? "Save changes" : "Create job"}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job title *" className="sm:col-span-2">
          <input value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} placeholder="E.g. Delivery Partner" className="ds-input w-full" />
        </Field>
        <Field label="Location *">
          <input value={form.location} onChange={(e) => set({ location: e.target.value })} maxLength={120} placeholder="E.g. Samba, Jammu & Kashmir" className="ds-input w-full" />
        </Field>
        <Field label="Employment type">
          <select value={form.employmentType} onChange={(e) => set({ employmentType: e.target.value })} className="ds-input w-full">
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Salary (optional)" help="Shown as written, e.g. ₹12,000 - ₹18,000 / month">
          <input value={form.salary} onChange={(e) => set({ salary: e.target.value })} maxLength={80} className="ds-input w-full" />
        </Field>
        <Field label="Number of openings (optional)">
          <input type="number" min="0" value={form.openings} onChange={(e) => set({ openings: e.target.value })} className="ds-input w-full" />
        </Field>
        <Field label="Short description" className="sm:col-span-2">
          <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={2} maxLength={3000} className="ds-input w-full resize-y" />
        </Field>
        <Field label="Responsibilities" help="One per line" className="sm:col-span-2">
          <textarea value={form.responsibilities} onChange={(e) => set({ responsibilities: e.target.value })} rows={4} className="ds-input w-full resize-y" />
        </Field>
        <Field label="Requirements / eligibility" help="One per line" className="sm:col-span-2">
          <textarea value={form.requirements} onChange={(e) => set({ requirements: e.target.value })} rows={4} className="ds-input w-full resize-y" />
        </Field>
        <Field label="Display order" help="Lower numbers show first">
          <input type="number" min="0" value={form.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} className="ds-input w-full" />
        </Field>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 sm:mt-6">
          <span className="text-sm font-bold text-slate-700">Show on Careers page</span>
          <Switch checked={form.isActive} onChange={(isActive) => set({ isActive })} label="Show on Careers page" />
        </div>
      </div>
    </Modal>
  );
};

const JobsPanel = ({ jobs, loading, onEdit, onChanged }) => {
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState("");

  const toggle = async (job, isActive) => {
    setBusyId(job.id);
    try {
      const res = await adminApi.setCareerJobActive(job.id, isActive);
      showToast(res.data?.message || "Saved", "success");
      onChanged();
    } catch (e) {
      showToast(e.response?.data?.message || "Could not change the job", "error");
    } finally {
      setBusyId("");
    }
  };

  const remove = async (job) => {
    const ok = window.confirm(
      `Delete "${job.title}"?\n\nIt will be removed from the Careers page. Its ${job.applications} application(s) are kept and stay visible under Applications.`,
    );
    if (!ok) return;
    setBusyId(job.id);
    try {
      await adminApi.deleteCareerJob(job.id);
      showToast("Job deleted", "success");
      onChanged();
    } catch (e) {
      showToast(e.response?.data?.message || "Could not delete the job", "error");
    } finally {
      setBusyId("");
    }
  };

  if (loading && jobs.length === 0) return <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />;

  if (jobs.length === 0) {
    return (
      <Card className="border-2 border-dashed border-slate-200 bg-white p-12 text-center shadow-none">
        <HiOutlineBriefcase className="mx-auto h-10 w-10 text-slate-300" />
        <h3 className="mt-3 text-lg font-black text-slate-700">No job openings yet</h3>
        <p className="mt-1 text-sm text-slate-500">Create one with the "New job opening" button.</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {jobs.map((job) => (
        <Card key={job.id} className={cn("border-none bg-white shadow-sm ring-1 ring-slate-100", !job.isActive && "opacity-70")} contentClassName="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-black text-slate-900">{job.title}</h3>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <HiOutlineMapPin className="h-3.5 w-3.5" /> {job.location}
                </span>
                <span>{job.employmentTypeLabel}</span>
                {job.salary && <span>{job.salary}</span>}
              </p>
            </div>
            <Switch checked={job.isActive} disabled={busyId === job.id} onChange={(v) => toggle(job, v)} label={`Show ${job.title} on Careers page`} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className={cn("rounded-full px-2.5 py-1", job.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
              {job.isActive ? "Live" : "Hidden"}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{job.applications} applications</span>
            {job.pendingApplications > 0 && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{job.pendingApplications} pending</span>
            )}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onEdit(job)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
            >
              <HiOutlinePencilSquare className="h-4 w-4" /> Edit
            </button>
            <button
              type="button"
              onClick={() => remove(job)}
              disabled={busyId === job.id}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100 disabled:opacity-50"
            >
              <HiOutlineTrash className="h-4 w-4" /> Delete
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default JobsPanel;
