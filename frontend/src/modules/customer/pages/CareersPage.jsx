import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Briefcase, CheckCircle2, ChevronLeft, Clock, IndianRupee, MapPin, Search, Users } from "lucide-react";
import { useSettings } from "@core/context/SettingsContext";
import { cn } from "@/lib/utils";
import { customerApi } from "../services/customerApi";
import JobApplicationForm from "../components/careers/JobApplicationForm";

const JobCard = ({ job, onApply }) => (
  <article className="flex h-full flex-col rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg sm:p-6">
    <div className="flex items-start gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-primary">
        <Briefcase size={22} />
      </div>
      <div className="min-w-0">
        <h2 className="text-lg font-black leading-tight text-slate-900">{job.title}</h2>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
            <MapPin size={12} /> {job.location}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-primary">
            <Clock size={12} /> {job.employmentTypeLabel}
          </span>
          {job.salary && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
              <IndianRupee size={12} /> {job.salary.replace(/^₹\s*/, "")}
            </span>
          )}
          {job.openings > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
              <Users size={12} /> {job.openings} {job.openings === 1 ? "opening" : "openings"}
            </span>
          )}
        </div>
      </div>
    </div>

    {job.description && <p className="mt-4 text-sm leading-relaxed text-slate-600">{job.description}</p>}

    {job.responsibilities.length > 0 && (
      <div className="mt-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">What you'll do</h3>
        <ul className="mt-2 space-y-1.5">
          {job.responsibilities.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-slate-700">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-primary" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    )}

    {job.requirements.length > 0 && (
      <div className="mt-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Requirements</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700 marker:text-slate-300">
          {job.requirements.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    )}

    {/* mt-auto keeps the buttons aligned across cards of different lengths */}
    <div className="mt-auto pt-6">
      <button
        type="button"
        onClick={() => onApply(job.id)}
        className="w-full rounded-2xl bg-primary py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-primary/20 transition hover:brightness-105 active:scale-[0.99]"
        aria-label={`Apply now for ${job.title}`}
      >
        Apply now
      </button>
    </div>
  </article>
);

const CareersPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { settings } = useSettings();
  const appName = settings?.appName || "Zozi9";

  const [jobs, setJobs] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [applyJobId, setApplyJobId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await customerApi.getCareerJobs();
      const result = res.data?.result || {};
      setJobs(Array.isArray(result.items) ? result.items : []);
      setLocations(Array.isArray(result.locations) ? result.locations : []);
    } catch {
      setError("We couldn't load the open positions. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // /careers?apply=<jobId> opens the form directly (shareable link)
  useEffect(() => {
    const id = searchParams.get("apply");
    if (id && jobs.some((j) => j.id === id)) setApplyJobId(id);
  }, [searchParams, jobs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter(
      (j) =>
        (!location || j.location === location) &&
        (!q || j.title.toLowerCase().includes(q) || (j.description || "").toLowerCase().includes(q)),
    );
  }, [jobs, search, location]);

  const closeForm = useCallback(() => {
    setApplyJobId(null);
    if (searchParams.get("apply")) {
      searchParams.delete("apply");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <div className="min-h-screen bg-slate-50 pb-24 font-sans">
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center gap-1 bg-white px-4 py-3 shadow-sm">
        <button
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="-ml-2 rounded-full p-2 transition-colors hover:bg-slate-100"
        >
          <ChevronLeft size={24} className="text-slate-600" />
        </button>
        <h1 className="text-lg font-black text-slate-800">Careers</h1>
      </div>

      {/* Hero */}
      <section className="bg-gradient-to-br from-[var(--brand-700)] via-primary to-[var(--brand-400)] px-5 pb-16 pt-10 text-center text-white sm:pt-14">
        <div className="mx-auto max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold backdrop-blur">
            <Briefcase size={14} /> We're hiring
          </span>
          <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Join Our Team</h2>
          <p className="mx-auto mt-2 max-w-md text-sm font-medium text-white/85 sm:text-base">
            Build your career with {appName} and become part of our growing team.
          </p>
        </div>
      </section>

      <div className="mx-auto -mt-8 max-w-6xl px-4">
        {/* Search + location */}
        <div className="flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-slate-100 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Search jobs</span>
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by job role"
              className="w-full rounded-xl bg-slate-50 py-3 pl-11 pr-4 text-sm font-medium text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="relative sm:w-64">
            <span className="sr-only">Filter by location</span>
            <MapPin size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full appearance-none rounded-xl bg-slate-50 py-3 pl-11 pr-4 text-sm font-medium text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All locations</option>
              {locations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Results */}
        <div className="mt-6">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-80 animate-pulse rounded-3xl bg-white" />
              ))}
            </div>
          ) : error ? (
            <div role="alert" className="rounded-3xl bg-white p-10 text-center shadow-sm">
              <p className="font-semibold text-slate-600">{error}</p>
              <button
                type="button"
                onClick={load}
                className="mt-4 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-black text-white active:scale-95"
              >
                Try again
              </button>
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-primary">
                <Briefcase size={28} />
              </div>
              <h2 className="text-lg font-black text-slate-800">No openings right now</h2>
              <p className="mx-auto mt-1 max-w-xs text-sm font-medium text-slate-500">
                We don't have open positions at the moment. Please check back soon.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
              <h2 className="text-lg font-black text-slate-800">No jobs match your search</h2>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setLocation("");
                }}
                className="mt-3 text-sm font-bold text-primary"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                {filtered.length} open {filtered.length === 1 ? "position" : "positions"}
              </p>
              <div className={cn("grid gap-4 sm:grid-cols-2", filtered.length > 2 && "lg:grid-cols-3")}>
                {filtered.map((job) => (
                  <JobCard key={job.id} job={job} onApply={setApplyJobId} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <JobApplicationForm open={!!applyJobId} jobs={jobs} initialJobId={applyJobId} onClose={closeForm} />
    </div>
  );
};

export default CareersPage;
