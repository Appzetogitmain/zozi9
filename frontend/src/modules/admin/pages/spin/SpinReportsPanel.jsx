import React, { useCallback, useEffect, useState } from "react";
import Card from "@shared/components/ui/Card";
import { cn } from "@/lib/utils";
import { adminApi } from "../../services/adminApi";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const num = (n) => Number(n || 0).toLocaleString("en-IN");

const Stat = ({ label, value, hint, tone }) => (
  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
    <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">{label}</p>
    <p className={cn("mt-1 text-2xl font-black tracking-tight", tone || "text-slate-800")}>{value}</p>
    {hint && <p className="mt-0.5 text-[11px] font-medium text-slate-400">{hint}</p>}
  </div>
);

const Section = ({ title, children }) => (
  <section className="space-y-3">
    <h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{title}</h3>
    {children}
  </section>
);

const SpinReportsPanel = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [filters, setFilters] = useState({ campaignId: "", from: "", to: "" });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi
      .getSpinCampaigns({ limit: 100 })
      .then((res) => setCampaigns(res.data?.result?.items || []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (filters.campaignId) params.campaignId = filters.campaignId;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      const res = await adminApi.getSpinReport(params);
      setReport(res.data?.result || null);
    } catch (e) {
      setError(e.response?.data?.message || "Could not load the report");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const maxDay = Math.max(1, ...(report?.spinsByDay || []).map((d) => d.spins));

  return (
    <div className="space-y-8">
      <Card className="flex flex-wrap items-end gap-4 border-none bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <div className="space-y-1">
          <label className="ds-label">Campaign</label>
          <select value={filters.campaignId} onChange={(e) => setFilters((f) => ({ ...f, campaignId: e.target.value }))} className="ds-input min-w-[14rem]">
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="ds-label">From</label>
          <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="ds-input" />
        </div>
        <div className="space-y-1">
          <label className="ds-label">To</label>
          <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="ds-input" />
        </div>
        <button type="button" onClick={load} className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white">
          Refresh
        </button>
      </Card>

      {error && <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-600">{error}</p>}

      {loading && !report ? (
        <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
      ) : report ? (
        <>
          <Section title="Funnel">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat label="Impressions" value={num(report.funnel.impressions)} hint="Times the popup was shown" />
              <Stat label="Unique viewers" value={num(report.funnel.uniqueViewers)} />
              <Stat label="Spins" value={num(report.funnel.spins)} />
              <Stat label="Participants" value={num(report.funnel.uniqueParticipants)} hint="Unique customers who spun" />
              <Stat label="Participation" value={`${report.conversion.participationRate}%`} hint="Participants ÷ viewers" tone="text-primary" />
            </div>
          </Section>

          <Section title="Coupons">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat label="Issued" value={num(report.coupons.issued)} />
              <Stat label="Available" value={num(report.coupons.available)} />
              <Stat label="Redeemed" value={num(report.coupons.redeemed)} tone="text-emerald-600" />
              <Stat label="Expired" value={num(report.coupons.expired)} tone="text-red-500" />
              <Stat label="Redemption rate" value={`${report.conversion.redemptionRate}%`} tone="text-primary" />
            </div>
          </Section>

          <Section title="Orders & cost">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Orders with a reward" value={num(report.attribution.orders)} />
              <Stat label="Revenue from those orders" value={inr(report.attribution.revenue)} hint={`Avg order ${inr(report.attribution.averageOrderValue)}`} />
              <Stat label="Company-funded discount" value={inr(report.cost.companyFundedDiscount)} />
              <Stat label="Seller-funded discount" value={inr(report.cost.sellerFundedDiscount)} hint="Sellers are not charged today" />
              <Stat label="Wallet cashback paid" value={inr(report.cost.walletCashback)} />
              <Stat label="Total campaign cost" value={inr(report.cost.totalCampaignCost)} tone="text-red-500" />
              <Stat label="Cost per order" value={inr(report.cost.costPerOrder)} />
              <Stat
                label="Revenue per ₹1 spent"
                value={report.conversion.revenuePerRupeeOfCost == null ? "-" : `₹${report.conversion.revenuePerRupeeOfCost}`}
                tone="text-emerald-600"
              />
            </div>
          </Section>

          <Section title="Rewards">
            <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Reward</th>
                    <th className="px-4 py-3">Won</th>
                    <th className="px-4 py-3">Share of spins</th>
                    <th className="px-4 py-3">Redeemed</th>
                    <th className="px-4 py-3">Discount given</th>
                    <th className="px-4 py-3">Left</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.byReward.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm font-semibold text-slate-400">
                        No rewards yet
                      </td>
                    </tr>
                  )}
                  {report.byReward.map((r) => (
                    <tr key={r.rewardId} className={cn(!r.isActive && "opacity-50")}>
                      <td className="px-4 py-3 font-bold text-slate-800">{r.label}</td>
                      <td className="px-4 py-3 font-semibold">{num(r.wins)}</td>
                      <td className="px-4 py-3 font-semibold">{r.share}%</td>
                      <td className="px-4 py-3 font-semibold">{num(r.redeemed)}</td>
                      <td className="px-4 py-3 font-semibold">{inr(r.discountGiven)}</td>
                      <td className="px-4 py-3 font-semibold">{r.remaining == null ? "∞" : num(r.remaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {report.spinsByDay.length > 0 && (
            <Section title="Spins per day">
              <div className="flex h-40 items-end gap-1.5 overflow-x-auto rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                {report.spinsByDay.map((d) => (
                  <div key={d.date} className="flex min-w-[1.6rem] flex-1 flex-col items-center justify-end gap-1" title={`${d.date}: ${d.spins}`}>
                    <span className="text-[10px] font-bold text-slate-500">{d.spins}</span>
                    <div className="w-full rounded-t-md bg-primary" style={{ height: `${Math.max(4, (d.spins / maxDay) * 100)}px` }} />
                    <span className="text-[9px] font-medium text-slate-400">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      ) : null}
    </div>
  );
};

export default SpinReportsPanel;
