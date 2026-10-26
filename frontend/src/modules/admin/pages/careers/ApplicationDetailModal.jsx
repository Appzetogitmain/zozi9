import React, { useEffect, useState } from "react";
import Modal from "@shared/components/ui/Modal";
import { useToast } from "@shared/components/ui/Toast";
import { HiOutlineDocumentText, HiOutlinePhone, HiOutlineEnvelope, HiOutlineMapPin } from "react-icons/hi2";
import { adminApi } from "../../services/adminApi";
import { STATUSES, StatusBadge, displayPhone, formatDateTime, Field } from "./careersShared";

// <input type="datetime-local"> uses local time; the API stores ISO
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const NOTIFY_STATUSES = ["shortlisted", "interview_scheduled", "selected"];

const InfoRow = ({ label, children }) => (
  <div>
    <dt className="text-[11px] font-black uppercase tracking-wider text-slate-400">{label}</dt>
    <dd className="mt-0.5 break-words text-sm font-semibold text-slate-800">{children || "—"}</dd>
  </div>
);

const ApplicationDetailModal = ({ applicationId, onClose, onChanged }) => {
  const { showToast } = useToast();
  const [app, setApp] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("pending");
  const [interviewAt, setInterviewAt] = useState("");
  const [notify, setNotify] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!applicationId) return undefined;
    let cancelled = false;
    setApp(null);
    setError("");
    setNote("");
    adminApi
      .getJobApplication(applicationId)
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.result;
        setApp(data);
        setStatus(data.status);
        setInterviewAt(toLocalInput(data.interviewAt));
        setNotify(true);
      })
      .catch((e) => !cancelled && setError(e.response?.data?.message || "Could not load this application"));
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const saveStatus = async () => {
    if (status === "interview_scheduled" && !interviewAt) {
      showToast("Pick the interview date and time", "error");
      return;
    }
    setBusy("status");
    try {
      const res = await adminApi.updateJobApplicationStatus(app.id, {
        status,
        interviewAt: status === "interview_scheduled" && interviewAt ? new Date(interviewAt).toISOString() : null,
        notify,
      });
      setApp(res.data?.result);
      showToast(res.data?.message || "Status updated", "success");
      onChanged?.();
    } catch (e) {
      showToast(e.response?.data?.message || "Could not update the status", "error");
    } finally {
      setBusy("");
    }
  };

  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy("note");
    try {
      const res = await adminApi.addJobApplicationNote(app.id, note.trim());
      setApp(res.data?.result);
      setNote("");
    } catch (err) {
      showToast(err.response?.data?.message || "Could not add the note", "error");
    } finally {
      setBusy("");
    }
  };

  // Fetched with the admin token and shown from memory: the PDF never gets a public link
  const openResume = async () => {
    const tab = window.open("", "_blank"); // opened now so pop-up blockers allow it
    setBusy("resume");
    try {
      const res = await adminApi.getJobApplicationResume(app.id);
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      if (tab) tab.location.href = url;
      else window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
    } catch (e) {
      tab?.close();
      let message = "Could not open the resume";
      if (e.response?.data instanceof Blob) {
        try {
          message = JSON.parse(await e.response.data.text()).message || message;
        } catch {
          /* keep default */
        }
      }
      showToast(message, "error");
    } finally {
      setBusy("");
    }
  };

  const statusChanged = app && status !== app.status;
  const canEmail = app?.email && NOTIFY_STATUSES.includes(status);

  return (
    <Modal isOpen={!!applicationId} onClose={onClose} title="Application details" size="lg">
      {error ? (
        <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-600">{error}</p>
      ) : !app ? (
        <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
      ) : (
        <div className="space-y-6">
          {/* Applicant */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-slate-900">{app.fullName}</h3>
              <p className="text-sm font-semibold text-slate-500">
                {app.jobTitle}
                {app.jobDeleted && <span className="ml-1 text-xs text-amber-600">(listing deleted)</span>}
                {" · "}Applied {formatDateTime(app.createdAt)}
              </p>
            </div>
            <StatusBadge status={app.status} />
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={`tel:${app.phone}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
            >
              <HiOutlinePhone className="h-4 w-4" /> {displayPhone(app.phone)}
            </a>
            {app.email && (
              <a
                href={`mailto:${app.email}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                <HiOutlineEnvelope className="h-4 w-4" /> {app.email}
              </a>
            )}
            {app.hasResume ? (
              <button
                type="button"
                onClick={openResume}
                disabled={busy === "resume"}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                <HiOutlineDocumentText className="h-4 w-4" />
                {busy === "resume" ? "Opening..." : "View resume"}
                <span className="font-medium opacity-80">({(app.resumeSize / 1024 / 1024).toFixed(1)} MB)</span>
              </button>
            ) : (
              <span className="inline-flex items-center rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-400">
                No resume uploaded
              </span>
            )}
          </div>

          <dl className="grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
            <InfoRow label="City / preferred location">
              <span className="inline-flex items-center gap-1">
                <HiOutlineMapPin className="h-4 w-4 text-slate-400" /> {app.city}
              </span>
            </InfoRow>
            <InfoRow label="Experience">
              {app.experienceType === "experienced" ? `${app.experienceYears} year(s)` : "Fresher"}
            </InfoRow>
            <InfoRow label="Full address">{app.address}</InfoRow>
            <InfoRow label="Job location">{app.jobLocation}</InfoRow>
            <div className="sm:col-span-2">
              <InfoRow label="Message">
                <span className="whitespace-pre-line font-medium">{app.message}</span>
              </InfoRow>
            </div>
          </dl>

          {/* Status */}
          <div className="space-y-3 rounded-2xl border border-slate-100 p-4">
            <h4 className="text-sm font-black text-slate-800">Update status</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Status">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="ds-input w-full">
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              {status === "interview_scheduled" && (
                <Field label="Interview date & time">
                  <input
                    type="datetime-local"
                    value={interviewAt}
                    onChange={(e) => setInterviewAt(e.target.value)}
                    className="ds-input w-full"
                  />
                </Field>
              )}
            </div>
            {NOTIFY_STATUSES.includes(status) && (
              <label className="flex items-start gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={notify && !!canEmail}
                  disabled={!canEmail}
                  onChange={(e) => setNotify(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                {app.email
                  ? `Email the applicant (${app.email}) about this update`
                  : "The applicant gave no email, so they won't be notified automatically. Call them instead."}
              </label>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={saveStatus}
                disabled={busy === "status" || (!statusChanged && status !== "interview_scheduled")}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
              >
                {busy === "status" ? "Saving..." : "Save status"}
              </button>
            </div>
            {app.interviewAt && app.status === "interview_scheduled" && (
              <p className="text-xs font-semibold text-amber-700">Interview: {formatDateTime(app.interviewAt)}</p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-3">
            <h4 className="text-sm font-black text-slate-800">Internal notes</h4>
            <p className="text-[11px] font-medium text-slate-400">Only admins can see these.</p>
            {app.notes.length > 0 && (
              <ul className="space-y-2">
                {[...app.notes].reverse().map((n) => (
                  <li key={n.id} className="rounded-xl bg-amber-50/60 p-3">
                    <p className="whitespace-pre-line text-sm text-slate-700">{n.text}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">
                      {n.byName} · {formatDateTime(n.at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={addNote} className="flex flex-col gap-2 sm:flex-row">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="E.g. Called on Monday, will join from 1st"
                className="ds-input min-h-[44px] w-full flex-1 resize-y"
              />
              <button
                type="submit"
                disabled={!note.trim() || busy === "note"}
                className="rounded-xl bg-primary px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50 sm:self-end"
              >
                {busy === "note" ? "Adding..." : "Add note"}
              </button>
            </form>
          </div>

          {/* History */}
          {app.statusHistory.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-black text-slate-800">History</h4>
              <ol className="space-y-1.5 border-l-2 border-slate-100 pl-4">
                {[...app.statusHistory].reverse().map((h, i) => (
                  <li key={`${h.status}-${h.at}-${i}`} className="text-xs text-slate-600">
                    <span className="font-bold">{STATUSES.find((s) => s.id === h.status)?.label || h.status}</span>
                    {" · "}
                    {h.byName || "Admin"} · {formatDateTime(h.at)}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ApplicationDetailModal;
