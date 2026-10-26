import React, { useCallback, useEffect, useState } from "react";
import Card from "@shared/components/ui/Card";
import Pagination from "@shared/components/ui/Pagination";
import { useToast } from "@shared/components/ui/Toast";
import { HiOutlineMagnifyingGlass, HiOutlineDocumentText } from "react-icons/hi2";
import { adminApi } from "../../services/adminApi";
import ApplicationDetailModal from "./ApplicationDetailModal";
import { STATUSES, StatusBadge, displayPhone, formatDate } from "./careersShared";

const EMPTY_FILTERS = { search: "", jobId: "", status: "", location: "", from: "", to: "" };

const ApplicationsPanel = ({ jobs, reloadKey, onChanged }) => {
  const { showToast } = useToast();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  // Search as you type, without a request per keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => (f.search === searchInput.trim() ? f : { ...f, search: searchInput.trim() }));
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getJobApplications({ ...filters, page, limit: pageSize });
      setData(res.data?.result || null);
    } catch (e) {
      showToast(e.response?.data?.message || "Could not load applications", "error");
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize, showToast]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const setFilter = (patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const hasFilters = Object.entries(filters).some(([, v]) => v) || searchInput;
  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <Card className="border-none bg-white shadow-sm ring-1 ring-slate-100" contentClassName="p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="relative xl:col-span-2">
            <span className="sr-only">Search by name or mobile</span>
            <HiOutlineMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or mobile number"
              className="ds-input w-full pl-9"
            />
          </label>
          <select value={filters.jobId} onChange={(e) => setFilter({ jobId: e.target.value })} className="ds-input w-full" aria-label="Job role">
            <option value="">All job roles</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} · {j.location}
              </option>
            ))}
            <option value="deleted">Deleted listings</option>
          </select>
          <select value={filters.status} onChange={(e) => setFilter({ status: e.target.value })} className="ds-input w-full" aria-label="Status">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <input
            value={filters.location}
            onChange={(e) => setFilter({ location: e.target.value })}
            placeholder="City / location"
            aria-label="Applicant city or location"
            className="ds-input w-full"
          />
          <div className="flex items-center gap-2 md:col-span-2 xl:col-span-1">
            <input
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => setFilter({ from: e.target.value })}
              aria-label="Applied from"
              className="ds-input w-full min-w-0"
            />
            <input
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => setFilter({ to: e.target.value })}
              aria-label="Applied until"
              className="ds-input w-full min-w-0"
            />
          </div>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setSearchInput("");
              setPage(1);
            }}
            className="mt-3 text-xs font-bold text-primary hover:underline"
          >
            Clear filters
          </button>
        )}
      </Card>

      <Card className="overflow-hidden border-none bg-white shadow-lg ring-1 ring-slate-100" contentClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Applicant</th>
                <th className="px-4 py-3">Job role</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Experience</th>
                <th className="px-4 py-3">Applied</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm font-semibold text-slate-400">Loading...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <p className="text-sm font-bold text-slate-500">{hasFilters ? "No applications match these filters" : "No applications yet"}</p>
                    {!hasFilters && (
                      <p className="mt-1 text-xs text-slate-400">Applications from the Careers page will appear here.</p>
                    )}
                  </td>
                </tr>
              ) : (
                items.map((a) => (
                  <tr key={a.id} className="cursor-pointer hover:bg-slate-50/70" onClick={() => setOpenId(a.id)}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-800">{a.fullName}</p>
                      <p className="text-xs text-slate-500">{displayPhone(a.phone)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-700">{a.jobTitle}</p>
                      {a.jobDeleted && <p className="text-[11px] font-semibold text-amber-600">Listing deleted</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{a.city}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {a.experienceType === "experienced" ? `${a.experienceYears} yr` : "Fresher"}
                      {a.hasResume && (
                        <HiOutlineDocumentText className="ml-1.5 inline h-4 w-4 text-primary" title="Resume attached" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(a.createdAt)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(a.id);
                        }}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {data && data.total > 0 && (
        <Pagination
          page={page}
          totalPages={data.totalPages}
          total={data.total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          loading={loading}
        />
      )}

      <ApplicationDetailModal
        applicationId={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => {
          load();
          onChanged?.();
        }}
      />
    </div>
  );
};

export default ApplicationsPanel;
