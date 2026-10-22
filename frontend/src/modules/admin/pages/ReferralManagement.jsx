import React, { useCallback, useEffect, useState } from "react";
import Card from "@shared/components/ui/Card";
import { useToast } from "@shared/components/ui/Toast";
import { cn } from "@/lib/utils";
import { adminApi } from "../services/adminApi";

const TABS = [
  { id: "settings", label: "Settings" },
  { id: "referrals", label: "Referrals" },
];

const REWARD_TYPES = [
  { value: "wallet", label: "Wallet cash (₹ added to wallet)" },
  { value: "fixed", label: "Coupon: flat ₹ off" },
  { value: "percentage", label: "Coupon: % off" },
  { value: "free_delivery", label: "Coupon: free delivery" },
];

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Waiting for first order" },
  { id: "completed", label: "Completed" },
];

const PAGE_SIZE = 20;

const emptyToNull = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

const formatDate = (value) =>
  value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const rewardText = (r = {}) => {
  if (r.outcome === "skipped_limit") return "Not given (limit reached)";
  if (r.outcome !== "issued") return "—";
  switch (r.type) {
    case "wallet":
      return `₹${r.value} wallet cash`;
    case "fixed":
      return `₹${r.value} off coupon`;
    case "percentage":
      return `${r.value}% off coupon`;
    case "free_delivery":
      return "Free delivery coupon";
    default:
      return "—";
  }
};

const Field = ({ label, help, children, className }) => (
  <div className={cn("space-y-1.5", className)}>
    <label className="ds-label">{label}</label>
    {children}
    {help && <p className="text-[11px] font-medium text-slate-400">{help}</p>}
  </div>
);

const Switch = ({ checked, onChange, disabled, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50",
      checked ? "bg-primary" : "bg-slate-300",
    )}
  >
    <span
      className={cn(
        "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
        checked ? "left-6" : "left-1",
      )}
    />
  </button>
);

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

const toRewardForm = (r = {}) => ({
  type: r.type || "wallet",
  value: r.value ?? 0,
  maxDiscount: r.maxDiscount ?? "",
  minCartValue: r.minCartValue ?? 0,
  validityDays: r.validityDays ?? 30,
});

const toRewardPayload = (r) => ({
  type: r.type,
  value: r.type === "free_delivery" ? 0 : Number(r.value || 0),
  maxDiscount: r.type === "percentage" ? emptyToNull(r.maxDiscount) : null,
  minCartValue: Number(r.minCartValue || 0),
  validityDays: Number(r.validityDays || 30),
});

const RewardEditor = ({ title, help, value, onChange }) => {
  const set = (patch) => onChange({ ...value, ...patch });
  const isCoupon = value.type !== "wallet";

  return (
    <Card className="border-none bg-white shadow-lg ring-1 ring-slate-100" title={title} subtitle={help}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Reward type" className="sm:col-span-2">
          <select value={value.type} onChange={(e) => set({ type: e.target.value })} className="ds-input w-full">
            {REWARD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Field>

        {value.type !== "free_delivery" && (
          <Field
            label={value.type === "percentage" ? "Discount (%)" : "Amount (₹)"}
            help="Set 0 to give nothing to this side."
          >
            <input
              type="number"
              min="0"
              max={value.type === "percentage" ? 100 : undefined}
              value={value.value}
              onChange={(e) => set({ value: e.target.value })}
              className="ds-input w-full"
            />
          </Field>
        )}

        {value.type === "percentage" && (
          <Field label="Maximum discount (₹)" help="Leave empty for no cap.">
            <input
              type="number"
              min="0"
              value={value.maxDiscount}
              onChange={(e) => set({ maxDiscount: e.target.value })}
              className="ds-input w-full"
            />
          </Field>
        )}

        {isCoupon && (
          <>
            <Field label="Minimum cart value to use the coupon (₹)">
              <input
                type="number"
                min="0"
                value={value.minCartValue}
                onChange={(e) => set({ minCartValue: e.target.value })}
                className="ds-input w-full"
              />
            </Field>
            <Field label="Coupon valid for (days)">
              <input
                type="number"
                min="1"
                max="365"
                value={value.validityDays}
                onChange={(e) => set({ validityDays: e.target.value })}
                className="ds-input w-full"
              />
            </Field>
          </>
        )}
      </div>
      <p className="mt-4 text-[11px] font-medium text-slate-500">
        {isCoupon
          ? "The coupon appears in the customer's My Rewards and can be applied once at checkout."
          : "The amount is added to the customer's wallet balance, which they can spend at checkout."}
      </p>
    </Card>
  );
};

const SettingsPanel = ({ settings, onSaved }) => {
  const { showToast } = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  // Fill the form once; flipping the master switch must not wipe unsaved edits
  useEffect(() => {
    if (!settings) return;
    setForm((prev) => prev ?? {
      referrerReward: toRewardForm(settings.referrerReward),
      refereeReward: toRewardForm(settings.refereeReward),
      minOrderValue: settings.minOrderValue ?? 0,
      maxReferralsPerUser: settings.maxReferralsPerUser ?? 0,
    });
  }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminApi.updateReferralSettings({
        referrerReward: toRewardPayload(form.referrerReward),
        refereeReward: toRewardPayload(form.refereeReward),
        minOrderValue: Number(form.minOrderValue || 0),
        maxReferralsPerUser: Number(form.maxReferralsPerUser || 0),
      });
      onSaved(res.data?.result);
      showToast("Refer & Earn settings saved", "success");
    } catch (e) {
      showToast(e.response?.data?.message || "Could not save the settings", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <RewardEditor
          title="Reward for the customer who shares"
          help="Given to the existing customer when their friend's first order is delivered."
          value={form.referrerReward}
          onChange={(referrerReward) => setForm((f) => ({ ...f, referrerReward }))}
        />
        <RewardEditor
          title="Welcome reward for the new friend"
          help="Given to the new customer when their own first order is delivered."
          value={form.refereeReward}
          onChange={(refereeReward) => setForm((f) => ({ ...f, refereeReward }))}
        />
      </div>

      <Card className="border-none bg-white shadow-lg ring-1 ring-slate-100" title="Rules">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Minimum first order value (₹)"
            help="The friend's delivered order (items total) must be at least this much. 0 = any order."
          >
            <input
              type="number"
              min="0"
              value={form.minOrderValue}
              onChange={(e) => setForm((f) => ({ ...f, minOrderValue: e.target.value }))}
              className="ds-input w-full"
            />
          </Field>
          <Field
            label="Maximum rewarded referrals per customer"
            help="After this many, the sharer stops earning (the friend still gets their reward). 0 = no limit."
          >
            <input
              type="number"
              min="0"
              value={form.maxReferralsPerUser}
              onChange={(e) => setForm((f) => ({ ...f, maxReferralsPerUser: e.target.value }))}
              className="ds-input w-full"
            />
          </Field>
        </div>
        <ul className="mt-4 space-y-1 text-[11px] font-medium text-slate-500">
          <li>• A code can only be used by a new customer before their first order, and never by its owner.</li>
          <li>• Changes apply to rewards issued from now on. Rewards already given are not changed.</li>
          <li>• While Refer &amp; Earn is switched off, no new rewards are issued; pending referrals wait.</li>
        </ul>
      </Card>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-2xl bg-slate-900 px-8 py-3 text-xs font-black uppercase tracking-widest text-white shadow-xl transition hover:scale-105 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Referrals list                                                      */
/* ------------------------------------------------------------------ */

const StatTile = ({ label, value }) => (
  <Card className="border-none bg-white shadow-sm ring-1 ring-slate-100" contentClassName="p-4">
    <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
  </Card>
);

const ReferralsPanel = () => {
  const { showToast } = useToast();
  const [status, setStatus] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getReferrals({ status, search, page, limit: PAGE_SIZE });
      setData(res.data?.result || null);
    } catch (e) {
      showToast(e.response?.data?.message || "Could not load referrals", "error");
    } finally {
      setLoading(false);
    }
  }, [status, search, page, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = data?.stats || {};
  const items = data?.items || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Total referrals" value={stats.total ?? 0} />
        <StatTile label="Waiting for first order" value={stats.pending ?? 0} />
        <StatTile label="Completed" value={stats.completed ?? 0} />
        <StatTile
          label="Rewards given"
          value={`₹${(stats.walletPaid || 0).toLocaleString("en-IN")}${stats.couponsIssued ? ` + ${stats.couponsIssued} coupons` : ""}`}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={status === f.id}
              type="button"
              onClick={() => {
                setStatus(f.id);
                setPage(1);
              }}
              className={cn(
                "rounded-lg px-4 py-2 text-xs font-black uppercase tracking-widest transition",
                status === f.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
          className="flex gap-2"
        >
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, phone or code"
            className="ds-input w-full lg:w-72"
          />
          <button type="submit" className="rounded-xl bg-slate-900 px-5 text-xs font-black uppercase tracking-widest text-white">
            Search
          </button>
        </form>
      </div>

      <Card className="overflow-hidden border-none bg-white p-0 shadow-lg ring-1 ring-slate-100" contentClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Shared by</th>
                <th className="px-4 py-3">New customer</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sharer reward</th>
                <th className="px-4 py-3">Friend reward</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm font-semibold text-slate-400">Loading...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm font-semibold text-slate-400">No referrals found</td>
                </tr>
              ) : (
                items.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-800">{r.referrer?.name || "—"}</p>
                      <p className="text-xs text-slate-500">{r.referrer?.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-800">{r.referee?.name || "—"}</p>
                      <p className="text-xs text-slate-500">{r.referee?.phone}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">{r.code}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider",
                          r.status === "completed" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600",
                        )}
                      >
                        {r.status === "completed" ? "Completed" : "Waiting for first order"}
                      </span>
                      {r.orderId && <p className="mt-1 text-[11px] text-slate-500">Order #{r.orderId}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">{rewardText(r.referrerReward)}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">{rewardText(r.refereeReward)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatDate(r.createdAt)}
                      {r.completedAt && <p className="mt-1">Rewarded {formatDate(r.completedAt)}</p>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-end gap-3 text-xs font-bold text-slate-600">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg bg-white px-4 py-2 ring-1 ring-slate-200 disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {data.page} of {data.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg bg-white px-4 py-2 ring-1 ring-slate-200 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const ReferralManagement = () => {
  const { showToast } = useToast();
  const [tab, setTab] = useState("settings");
  const [settings, setSettings] = useState(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    adminApi
      .getReferralSettings()
      .then((res) => setSettings(res.data?.result || {}))
      .catch(() => showToast("Could not load Refer & Earn settings", "error"));
  }, [showToast]);

  const enabled = settings ? !!settings.enabled : null;

  const toggleEnabled = async (next) => {
    setToggling(true);
    try {
      const res = await adminApi.updateReferralSettings({ enabled: next });
      setSettings(res.data?.result || settings);
      showToast(next ? "Refer & Earn is now live for customers" : "Refer & Earn switched off", "success");
    } catch (e) {
      showToast(e.response?.data?.message || "Could not change the Refer & Earn switch", "error");
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 pb-20 duration-700">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
        <div>
          <h1 className="ds-h1">Refer &amp; Earn</h1>
          <p className="ds-description">
            Customers share their code with friends. When a friend's first order is delivered, both get the rewards you set here.
          </p>
        </div>
        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl px-4 py-2.5 ring-1 transition-colors",
            enabled ? "bg-brand-50 ring-brand-100" : "bg-slate-50 ring-slate-200",
          )}
        >
          <div className="leading-tight">
            <p className="text-xs font-black uppercase tracking-wider text-slate-700">Refer &amp; Earn</p>
            <p className={cn("text-[11px] font-bold", enabled ? "text-primary" : "text-slate-400")}>
              {enabled == null ? "Loading..." : enabled ? "Live for customers" : "Switched off"}
            </p>
          </div>
          <Switch
            checked={!!enabled}
            disabled={enabled == null || toggling}
            onChange={toggleEnabled}
            label="Turn Refer and Earn on or off"
          />
        </div>
      </div>

      {enabled === false && (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-700">
          Refer &amp; Earn is switched off, so customers cannot use codes and no rewards are issued. Set the rewards below, then use the switch above to go live.
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
        {tab === "settings" && <SettingsPanel settings={settings} onSaved={setSettings} />}
        {tab === "referrals" && <ReferralsPanel />}
      </div>
    </div>
  );
};

export default ReferralManagement;
