import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Clock, Copy, Gift, Loader2, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { customerApi } from "../services/customerApi";
import { daysLeft, formatExpiry, iconFor, rewardConditions } from "../components/spin/spinTheme";

const TABS = [
  { id: "available", label: "Available" },
  { id: "redeemed", label: "Redeemed" },
  { id: "expired", label: "Expired" },
];

const PAGE_SIZE = 10;

const EMPTY_COPY = {
  available: {
    title: "No rewards yet",
    text: "Spin the wheel when it appears on the home screen to win discounts, free delivery and more.",
  },
  redeemed: { title: "Nothing redeemed yet", text: "Rewards you use on an order will show up here." },
  expired: { title: "No expired rewards", text: "Use your rewards before their expiry date so they don't go to waste." },
};

const MyRewardsPage = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState("available");
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ available: 0, redeemed: 0, expired: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(
    async (nextPage = 1, append = false) => {
      append ? setLoadingMore(true) : setLoading(true);
      setError("");
      try {
        const res = await customerApi.getMyRewards({ status: tab, page: nextPage, limit: PAGE_SIZE });
        const data = res.data?.result;
        setItems((prev) => (append ? [...prev, ...(data?.items || [])] : data?.items || []));
        setCounts(data?.counts || { available: 0, redeemed: 0, expired: 0 });
        setPage(data?.page || nextPage);
        setTotalPages(data?.totalPages || 1);
      } catch (err) {
        setError(err.response?.data?.message || "We couldn't load your rewards. Please try again.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [tab],
  );

  useEffect(() => {
    load(1, false);
  }, [load]);

  const copy = async (reward) => {
    try {
      await navigator.clipboard.writeText(reward.code);
      setCopiedId(reward.id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      /* clipboard blocked: code stays visible */
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="sticky top-0 z-30 bg-gradient-to-r from-primary to-[var(--brand-400)] px-4 pb-5 pt-5 text-white shadow-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 backdrop-blur transition active:scale-90"
          >
            <ArrowLeft size={20} strokeWidth={2.5} />
          </button>
          <div>
            <h1 className="text-xl font-black tracking-tight">My Rewards</h1>
            <p className="text-xs font-medium text-white/80">Coupons you won with Spin &amp; Win</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 pt-4">
        <div role="tablist" className="grid grid-cols-3 gap-2 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-100">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-xl px-2 py-2.5 text-sm font-bold transition",
                tab === t.id ? "bg-primary text-white shadow" : "text-slate-500 hover:bg-slate-50",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-black",
                  tab === t.id ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500",
                )}
              >
                {counts[t.id] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {loading ? (
            [0, 1, 2].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-white" />)
          ) : error ? (
            <div role="alert" className="rounded-2xl bg-white p-8 text-center shadow-sm">
              <p className="font-semibold text-slate-600">{error}</p>
              <button
                type="button"
                onClick={() => load(1, false)}
                className="mt-4 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-black text-white active:scale-95"
              >
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-primary">
                <Gift size={28} />
              </div>
              <h2 className="text-lg font-black text-slate-800">{EMPTY_COPY[tab].title}</h2>
              <p className="mx-auto mt-1 max-w-xs text-sm font-medium text-slate-500">{EMPTY_COPY[tab].text}</p>
              {tab === "available" && (
                <Link
                  to="/"
                  className="mt-5 inline-block rounded-xl bg-primary px-6 py-2.5 text-sm font-black text-white"
                >
                  Start shopping
                </Link>
              )}
            </div>
          ) : (
            items.map((reward) => (
              <RewardCard key={reward.id} reward={reward} copied={copiedId === reward.id} onCopy={() => copy(reward)} />
            ))
          )}

          {!loading && !error && page < totalPages && (
            <button
              type="button"
              onClick={() => load(page + 1, true)}
              disabled={loadingMore}
              className="mx-auto flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-black text-slate-700 shadow-sm ring-1 ring-slate-100 disabled:opacity-60"
            >
              {loadingMore && <Loader2 size={16} className="animate-spin" />}
              Load more
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const RewardCard = ({ reward, copied, onCopy }) => {
  const inactive = reward.status !== "available";
  const left = reward.status === "available" ? daysLeft(reward.expiresAt) : null;
  const isCashback = reward.type === "wallet_cashback";

  return (
    <article className={cn("relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100", inactive && "opacity-80")}>
      <div className="flex">
        <div
          className={cn(
            "flex w-24 shrink-0 flex-col items-center justify-center gap-1 px-2 py-4 text-center",
            inactive ? "bg-slate-100 text-slate-500" : "bg-gradient-to-b from-primary to-[var(--brand-400)] text-white",
          )}
        >
          <span className="text-3xl">{iconFor({ type: reward.type })}</span>
          <span className="text-sm font-black leading-tight">{reward.valueLabel || "Reward"}</span>
        </div>

        <div className="min-w-0 flex-1 border-l-2 border-dashed border-slate-200 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-base font-black text-slate-800">{reward.label}</h3>
            <StatusBadge status={reward.status} />
          </div>

          {!isCashback && (
            <button
              type="button"
              onClick={onCopy}
              disabled={inactive}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1 font-mono text-xs font-black tracking-widest text-slate-700 ring-1 ring-slate-200 disabled:cursor-default"
              aria-label={`Copy code ${reward.code}`}
            >
              {reward.code}
              {!inactive && (copied ? <Check size={13} className="text-primary" /> : <Copy size={13} />)}
            </button>
          )}

          <ul className="mt-2 space-y-0.5 text-[11px] font-medium text-slate-500">
            {rewardConditions(reward)
              .slice(0, 4)
              .map((line) => (
                <li key={line}>• {line}</li>
              ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold">
            {reward.status === "available" && (
              <span className={cn("flex items-center gap-1", left != null && left <= 2 ? "text-red-500" : "text-slate-500")}>
                <Clock size={12} />
                {left === 0 ? "Expires today" : left === 1 ? "1 day left" : `${left} days left`} · {formatExpiry(reward.expiresAt)}
              </span>
            )}
            {reward.status === "redeemed" && (
              <span className="text-slate-500">
                {isCashback ? "Credited to wallet" : "Used"}
                {reward.redeemedAt ? ` on ${formatExpiry(reward.redeemedAt)}` : ""}
                {reward.discountApplied ? ` · saved ₹${reward.discountApplied}` : ""}
              </span>
            )}
            {reward.status === "expired" && <span className="text-slate-500">Expired on {formatExpiry(reward.expiresAt)}</span>}

            {reward.status === "redeemed" && reward.orderId && (
              <Link to={`/orders/${reward.orderId}`} className="flex items-center gap-1 text-primary">
                <Ticket size={12} /> Order #{reward.orderId}
              </Link>
            )}
            {reward.status === "available" && !isCashback && (
              <Link to="/checkout" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-black text-white">
                Use at checkout
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

const StatusBadge = ({ status }) => {
  const styles = {
    available: "bg-emerald-50 text-emerald-600",
    redeemed: "bg-slate-100 text-slate-500",
    expired: "bg-red-50 text-red-500",
  };
  return (
    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider", styles[status] || styles.redeemed)}>
      {status}
    </span>
  );
};

export default MyRewardsPage;
