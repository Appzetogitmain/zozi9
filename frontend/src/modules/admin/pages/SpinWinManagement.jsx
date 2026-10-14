import React, { useCallback, useEffect, useState } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import { useToast } from "@shared/components/ui/Toast";
import { HiOutlinePencilSquare, HiOutlinePlus } from "react-icons/hi2";
import { cn } from "@/lib/utils";
import { adminApi } from "../services/adminApi";
import SpinSettingsPanel from "./spin/SpinSettingsPanel";
import SpinReportsPanel from "./spin/SpinReportsPanel";
import SpinCampaignEditor, { STATUS_BADGE } from "./spin/SpinCampaignEditor";

const TABS = [
  { id: "campaigns", label: "Campaigns" },
  { id: "settings", label: "Settings" },
  { id: "reports", label: "Reports" },
];

const formatDate = (value) =>
  value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not set";

const CampaignsPanel = ({ reloadKey, onOpen }) => {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminApi.getSpinCampaigns({ status: filter, limit: 100 });
      setItems(res.data?.result?.items || []);
    } catch (e) {
      setError(e.response?.data?.message || "Could not load campaigns");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {["all", "draft", "active", "paused", "completed"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider transition",
              filter === s ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-600">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="border-2 border-dashed border-slate-200 bg-white p-12 text-center shadow-none">
          <p className="text-lg font-black text-slate-700">No campaigns yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm font-medium text-slate-400">
            Create a campaign, add the rewards for the wheel, then activate it. Customers will see the popup when it is live.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const [variant, label] = STATUS_BADGE[c.effectiveStatus] || STATUS_BADGE.draft;
            return (
              <Card key={c._id} className="flex flex-wrap items-center justify-between gap-4 border-none bg-white p-5 shadow-sm ring-1 ring-slate-100">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-base font-black text-slate-800">{c.name}</h3>
                    <Badge variant={variant}>{label}</Badge>
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {formatDate(c.startAt)} → {formatDate(c.endAt)}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-400">
                    {c.rewardCount} active rewards · {c.spinCount} spins · {c.participation?.maxSpins}{" "}
                    {c.participation?.maxSpins === 1 ? "spin" : "spins"} per customer
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpen(c._id)}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-200"
                >
                  <HiOutlinePencilSquare className="h-4 w-4" /> Manage
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

const SpinWinManagement = () => {
  const { showToast } = useToast();
  const [tab, setTab] = useState("campaigns");
  const [masterEnabled, setMasterEnabled] = useState(null);
  const [editor, setEditor] = useState({ open: false, id: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [togglingMaster, setTogglingMaster] = useState(false);

  // Master switch in the page header (same setting as Settings -> "Spin & Win is live")
  const toggleMaster = async (next) => {
    const previous = masterEnabled;
    setMasterEnabled(next); // optimistic
    setTogglingMaster(true);
    try {
      const res = await adminApi.updateSpinSettings({ enabled: next });
      setMasterEnabled(!!res.data?.result?.enabled);
      showToast(next ? "Spin & Win is now live for customers" : "Spin & Win switched off. No new spins are allowed.", "success");
    } catch (e) {
      setMasterEnabled(previous);
      showToast(e.response?.data?.message || "Could not change the Spin & Win switch", "error");
    } finally {
      setTogglingMaster(false);
    }
  };

  useEffect(() => {
    adminApi
      .getSpinSettings()
      .then((res) => setMasterEnabled(!!res.data?.result?.enabled))
      .catch(() => showToast("Could not load Spin & Win settings", "error"));
  }, [showToast]);

  return (
    <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 pb-20 duration-700">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
        <div>
          <h1 className="ds-h1 flex items-center gap-3">
            Spin &amp; Win
          </h1>
          <p className="ds-description">
            Let customers spin a wheel for discounts, free delivery, cashback and gifts. You decide the rewards and how often each one is won.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div
            className={cn(
              "flex items-center gap-3 rounded-2xl px-4 py-2.5 ring-1 transition-colors",
              masterEnabled ? "bg-brand-50 ring-brand-100" : "bg-slate-50 ring-slate-200",
            )}
          >
            <div className="leading-tight">
              <p className="text-xs font-black uppercase tracking-wider text-slate-700">Spin &amp; Win</p>
              <p className={cn("text-[11px] font-bold", masterEnabled ? "text-primary" : "text-slate-400")}>
                {masterEnabled == null ? "Loading..." : masterEnabled ? "Live for customers" : "Switched off"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!masterEnabled}
              aria-label="Turn Spin and Win on or off"
              disabled={masterEnabled == null || togglingMaster}
              onClick={() => toggleMaster(!masterEnabled)}
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50",
                masterEnabled ? "bg-primary" : "bg-slate-300",
              )}
            >
              <span
                className={cn(
                  "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
                  masterEnabled ? "left-6" : "left-1",
                )}
              />
            </button>
          </div>
          {tab === "campaigns" && (
            <button
              type="button"
              onClick={() => setEditor({ open: true, id: null })}
              className="flex items-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-xl transition hover:scale-105"
            >
              <HiOutlinePlus className="h-5 w-5" /> New campaign
            </button>
          )}
        </div>
      </div>

      {masterEnabled === false && (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-700">
          Spin &amp; Win is switched off, so customers do not see any campaign. Use the toggle above when you are ready to go live.
        </p>
      )}

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
        {tab === "campaigns" && <CampaignsPanel reloadKey={reloadKey} onOpen={(id) => setEditor({ open: true, id })} />}
        {tab === "settings" && <SpinSettingsPanel onChanged={(s) => setMasterEnabled(!!s?.enabled)} />}
        {tab === "reports" && <SpinReportsPanel />}
      </div>

      <SpinCampaignEditor
        isOpen={editor.open}
        campaignId={editor.id}
        onClose={() => setEditor({ open: false, id: null })}
        onChanged={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
};

export default SpinWinManagement;
