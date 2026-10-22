import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Copy, Gift, Loader2, Share2, ShoppingBag, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSettings } from "@core/context/SettingsContext";
import { customerApi } from "../services/customerApi";

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

const ReferEarnPage = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const appName = settings?.appName || "our app";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [friendCode, setFriendCode] = useState("");
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await customerApi.getMyReferrals();
      setData(res.data?.result || null);
    } catch (err) {
      setError(err.response?.data?.message || "We couldn't load Refer & Earn. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const program = data?.program;
  const code = data?.code || "";
  const shareLink = code ? `${window.location.origin}/signup?ref=${encodeURIComponent(code)}` : "";
  const friendGets = program?.refereeReward?.label;
  const youGet = program?.referrerReward?.label;
  const shareText = [
    `Join me on ${appName}!`,
    friendGets ? `Sign up with my code ${code} and get ${friendGets} on your first order.` : `Sign up with my code ${code}.`,
    shareLink,
  ].join(" ");

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: code stays visible */
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Join ${appName}`, text: shareText });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      toast.success("Invite message copied. Paste it anywhere to share.");
    } catch {
      toast.error("Could not share. Copy your code instead.");
    }
  };

  const applyFriendCode = async (e) => {
    e.preventDefault();
    if (!friendCode.trim()) return;
    setApplying(true);
    try {
      const res = await customerApi.applyReferralCode(friendCode.trim());
      toast.success(res.data?.message || "Referral code applied!");
      setFriendCode("");
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not apply this code");
    } finally {
      setApplying(false);
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
            <h1 className="text-xl font-black tracking-tight">Refer &amp; Earn</h1>
            <p className="text-xs font-medium text-white/80">Invite friends and earn rewards together</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4">
        {loading ? (
          [0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-white" />)
        ) : error ? (
          <div role="alert" className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="font-semibold text-slate-600">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-4 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-black text-white active:scale-95"
            >
              Try again
            </button>
          </div>
        ) : !program?.enabled ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-primary">
              <Gift size={28} />
            </div>
            <h2 className="text-lg font-black text-slate-800">Refer &amp; Earn is paused</h2>
            <p className="mx-auto mt-1 max-w-xs text-sm font-medium text-slate-500">
              There is no referral offer running right now. Please check back later.
            </p>
          </div>
        ) : (
          <>
            {/* Offer + code */}
            <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
              <div className="bg-brand-50 px-5 py-5 text-center">
                <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white">
                  <Gift size={26} />
                </div>
                <h2 className="text-lg font-black leading-snug text-slate-900">
                  {youGet ? `Get ${youGet} for every friend who orders` : "Invite your friends"}
                </h2>
                {friendGets && (
                  <p className="mt-1 text-sm font-medium text-slate-600">
                    Your friend gets {friendGets} too.
                  </p>
                )}
              </div>

              <div className="p-5">
                <p className="text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">Your referral code</p>
                <button
                  type="button"
                  onClick={copyCode}
                  aria-label={`Copy code ${code}`}
                  className="mx-auto mt-2 flex items-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-slate-50 px-5 py-3 font-mono text-xl font-black tracking-[0.2em] text-slate-800"
                >
                  {code}
                  {copied ? <Check size={18} className="text-primary" /> : <Copy size={18} className="text-slate-400" />}
                </button>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={share}
                    className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-white active:scale-95"
                  >
                    <Share2 size={16} /> Share invite
                  </button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-black text-white active:scale-95"
                  >
                    WhatsApp
                  </a>
                </div>
              </div>
            </section>

            {/* How it works */}
            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
              <h3 className="text-base font-black text-slate-800">How it works</h3>
              <ol className="mt-3 space-y-3">
                <Step icon={Share2} title="Share your code" text="Send your code or invite link to friends." />
                <Step
                  icon={UserPlus}
                  title="Friend signs up"
                  text="They enter your code when creating their account."
                />
                <Step
                  icon={ShoppingBag}
                  title="You both get rewarded"
                  text={
                    program.minOrderValue > 0
                      ? `When their first order of ₹${program.minOrderValue} or more is delivered.`
                      : "When their first order is delivered."
                  }
                />
              </ol>
              <p className="mt-3 text-[11px] font-medium text-slate-500">
                Wallet cash can be used at checkout. Coupons appear in{" "}
                <Link to="/rewards" className="font-bold text-primary">My Rewards</Link>.
              </p>
            </section>

            {/* Apply a friend's code (only before the first order) */}
            {data.canApplyCode && (
              <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
                <h3 className="text-base font-black text-slate-800">Have a friend's code?</h3>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Enter it before your first order{friendGets ? ` to get ${friendGets}` : ""}.
                </p>
                <form onSubmit={applyFriendCode} className="mt-3 flex gap-2">
                  <input
                    value={friendCode}
                    onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
                    placeholder="Enter code"
                    maxLength={32}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm font-bold uppercase tracking-widest text-slate-800 outline-none focus:border-primary focus:bg-white"
                  />
                  <button
                    type="submit"
                    disabled={applying || !friendCode.trim()}
                    className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
                  >
                    {applying && <Loader2 size={16} className="animate-spin" />}
                    Apply
                  </button>
                </form>
              </section>
            )}

            {/* Stats */}
            <section className="grid grid-cols-3 gap-2">
              <Stat label="Invited" value={data.stats.total} />
              <Stat label="Completed" value={data.stats.completed} />
              <Stat
                label="Earned"
                value={`₹${(data.stats.walletEarned || 0).toLocaleString("en-IN")}`}
                sub={data.stats.couponsEarned ? `+ ${data.stats.couponsEarned} coupon${data.stats.couponsEarned > 1 ? "s" : ""}` : ""}
              />
            </section>

            {/* Friends */}
            <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                <h3 className="text-base font-black text-slate-800">Your referrals</h3>
                <Users size={18} className="text-slate-400" />
              </div>
              {data.referrals.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm font-medium text-slate-500">
                  No friends have joined with your code yet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.referrals.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800">
                          {r.friendName} <span className="font-medium text-slate-400">{r.friendPhone}</span>
                        </p>
                        <p className="text-[11px] font-medium text-slate-500">Joined {formatDate(r.joinedAt)}</p>
                      </div>
                      <ReferralStatus referral={r} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

const Step = ({ icon: Icon, title, text }) => (
  <li className="flex items-start gap-3">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-primary">
      <Icon size={17} />
    </span>
    <div>
      <p className="text-sm font-bold text-slate-800">{title}</p>
      <p className="text-xs font-medium text-slate-500">{text}</p>
    </div>
  </li>
);

const Stat = ({ label, value, sub }) => (
  <div className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-100">
    <p className="text-lg font-black text-slate-900">{value}</p>
    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
    {sub && <p className="mt-0.5 text-[10px] font-semibold text-primary">{sub}</p>}
  </div>
);

const ReferralStatus = ({ referral }) => {
  if (referral.status === "pending") {
    return (
      <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-600">
        Waiting for first order
      </span>
    );
  }
  return (
    <div className="shrink-0 text-right">
      <span
        className={cn(
          "rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider",
          referral.rewardOutcome === "issued" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500",
        )}
      >
        {referral.rewardOutcome === "issued" ? "Rewarded" : "Completed"}
      </span>
      {referral.rewardLabel && <p className="mt-1 text-[11px] font-bold text-slate-600">{referral.rewardLabel}</p>}
      {referral.rewardOutcome === "skipped_limit" && (
        <p className="mt-1 text-[10px] font-medium text-slate-400">Referral limit reached</p>
      )}
    </div>
  );
};

export default ReferEarnPage;
