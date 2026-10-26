import React from "react";
import { cn } from "@/lib/utils";

export const STATUSES = [
  { id: "pending", label: "Pending", className: "bg-slate-100 text-slate-600" },
  { id: "under_review", label: "Under Review", className: "bg-sky-50 text-sky-700" },
  { id: "shortlisted", label: "Shortlisted", className: "bg-violet-50 text-violet-700" },
  { id: "interview_scheduled", label: "Interview Scheduled", className: "bg-amber-50 text-amber-700" },
  { id: "selected", label: "Selected", className: "bg-emerald-50 text-emerald-700" },
  { id: "rejected", label: "Rejected", className: "bg-rose-50 text-rose-700" },
];

export const EMPLOYMENT_TYPES = [
  { id: "full_time", label: "Full-time" },
  { id: "part_time", label: "Part-time" },
  { id: "contract", label: "Contract" },
  { id: "internship", label: "Internship" },
  { id: "flexible", label: "Flexible hours" },
];

export const StatusBadge = ({ status, className }) => {
  const s = STATUSES.find((x) => x.id === status) || STATUSES[0];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider",
        s.className,
        className,
      )}
    >
      {s.label}
    </span>
  );
};

export const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      })
    : "—";

export const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
    : "—";

export const displayPhone = (phone) => String(phone || "").replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2");

export const Field = ({ label, help, children, className }) => (
  <div className={cn("space-y-1.5", className)}>
    <label className="ds-label">{label}</label>
    {children}
    {help && <p className="text-[11px] font-medium text-slate-400">{help}</p>}
  </div>
);
