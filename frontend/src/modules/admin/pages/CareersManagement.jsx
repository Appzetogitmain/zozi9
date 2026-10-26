import React, { useCallback, useEffect, useState } from "react";
import Card from "@shared/components/ui/Card";
import { useToast } from "@shared/components/ui/Toast";
import { HiOutlinePlus } from "react-icons/hi2";
import { cn } from "@/lib/utils";
import { adminApi } from "../services/adminApi";
import ApplicationsPanel from "./careers/ApplicationsPanel";
import JobsPanel, { JobFormModal } from "./careers/JobsPanel";

const TABS = [
  { id: "applications", label: "Applications" },
  { id: "jobs", label: "Job Openings" },
];

const StatTile = ({ label, value, sub, accent }) => (
  <Card className="border-none bg-white shadow-sm ring-1 ring-slate-100" contentClassName="p-4">
    <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</p>
    <p className={cn("mt-1 text-2xl font-black text-slate-900", accent)}>{value}</p>
    {sub && <p className="mt-0.5 text-[11px] font-semibold text-slate-400">{sub}</p>}
  </Card>
);

const CareersManagement = () => {
  const { showToast } = useToast();
  const [tab, setTab] = useState("applications");
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [editor, setEditor] = useState({ open: false, job: null });
  const [reloadKey, setReloadKey] = useState(0);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const res = await adminApi.getCareerJobs();
      // handleResponse sends lists as `results`
      const list = res.data?.results ?? res.data?.result;
      setJobs(Array.isArray(list) ? list : []);
    } catch (e) {
      showToast(e.response?.data?.message || "Could not load job openings", "error");
    } finally {
      setJobsLoading(false);
    }
  }, [showToast]);

  const loadStats = useCallback(async () => {
    try {
      const res = await adminApi.getCareersStats();
      setStats(res.data?.result || null);
    } catch {
      /* the page still works without the summary */
    }
  }, []);

  useEffect(() => {
    loadJobs();
    loadStats();
  }, [loadJobs, loadStats]);

  const refreshAll = () => {
    loadJobs();
    loadStats();
    setReloadKey((k) => k + 1);
  };

  const sc = stats?.statusCounts || {};

  return (
    <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 pb-20 duration-700">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
        <div>
          <h1 className="ds-h1">Careers</h1>
          <p className="ds-description">Manage job openings shown on the "Join Our Team" page and review applications.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/careers"
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl bg-white px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            View careers page
          </a>
          <button
            type="button"
            onClick={() => setEditor({ open: true, job: null })}
            className="flex items-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-xl transition hover:scale-105"
          >
            <HiOutlinePlus className="h-5 w-5" /> New job opening
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Total applications" value={stats?.totalApplications ?? "—"} sub={stats ? `${stats.lastWeekApplications} in the last 7 days` : ""} />
        <StatTile label="Waiting for review" value={stats ? (sc.pending || 0) + (sc.under_review || 0) : "—"} accent="text-amber-600" />
        <StatTile label="Shortlisted / interview" value={stats ? (sc.shortlisted || 0) + (sc.interview_scheduled || 0) : "—"} accent="text-violet-600" />
        <StatTile label="Selected" value={stats ? sc.selected || 0 : "—"} accent="text-emerald-600" />
        <StatTile label="Live openings" value={stats ? `${stats.activeJobs} / ${stats.totalJobs}` : "—"} sub="live / total" />
      </div>

      <div role="tablist" className="mt-6 inline-flex rounded-xl bg-slate-100 p-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg px-5 py-2 text-xs font-black uppercase tracking-widest transition",
              tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "applications" ? (
          <ApplicationsPanel jobs={jobs} reloadKey={reloadKey} onChanged={loadStats} />
        ) : (
          <JobsPanel jobs={jobs} loading={jobsLoading} onEdit={(job) => setEditor({ open: true, job })} onChanged={refreshAll} />
        )}
      </div>

      <JobFormModal
        isOpen={editor.open}
        job={editor.job}
        onClose={() => setEditor({ open: false, job: null })}
        onSaved={refreshAll}
      />
    </div>
  );
};

export default CareersManagement;
