import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, ChevronDown, Copy, Gift, Loader2, RotateCw, X } from "lucide-react";
import { useAuth } from "@core/context/AuthContext";
import { customerApi } from "../../services/customerApi";
import SpinWheel from "./SpinWheel";
import { formatExpiry, iconFor, rewardConditions } from "./spinTheme";

const STATE_KEY = "spinwin_popup_state_v1";
const sessionKey = (id) => `spinwin_session_${id}`;
const VIEWER_KEY = "spinwin_viewer_key";

const safeStorage = {
  get(storage, key) {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  },
  set(storage, key, value) {
    try {
      storage.setItem(key, value);
    } catch {
      /* private mode / storage full: popup frequency just falls back to "every session" */
    }
  },
};

const newKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;

/**
 * Popup frequency is only a UX nicety stored in the browser. The real limits
 * (spins per customer / period, eligibility) are always enforced by the server.
 */
function frequencyAllowsPopup(campaign) {
  if (safeStorage.get(sessionStorage, sessionKey(campaign.id))) return false; // already shown this session

  let state = null;
  try {
    state = JSON.parse(safeStorage.get(localStorage, STATE_KEY) || "null");
  } catch {
    state = null;
  }
  if (!state || state.campaignId !== campaign.id) return true;

  const last = new Date(state.lastShownAt);
  const now = new Date();
  switch (campaign.popup?.frequency) {
    case "once":
      return false;
    case "daily":
      return last.toDateString() !== now.toDateString();
    case "weekly":
      return now.getTime() - last.getTime() >= 7 * 24 * 60 * 60 * 1000;
    default:
      return true; // every_session
  }
}

function markPopupShown(campaign) {
  safeStorage.set(sessionStorage, sessionKey(campaign.id), "1");
  safeStorage.set(
    localStorage,
    STATE_KEY,
    JSON.stringify({ campaignId: campaign.id, lastShownAt: new Date().toISOString() }),
  );
}

function viewerKey() {
  let key = safeStorage.get(sessionStorage, VIEWER_KEY);
  if (!key) {
    key = newKey();
    safeStorage.set(sessionStorage, VIEWER_KEY, key);
  }
  return key;
}

const SpinWinPopup = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const routerLocation = useLocation();

  const [campaign, setCampaign] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | spinning | result
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [showTerms, setShowTerms] = useState(false);
  const [copied, setCopied] = useState(false);

  const wheelRef = useRef(null);
  const spinKeyRef = useRef(null); // reused when a request is retried => never a 2nd reward
  const closeRef = useRef(null);
  const busyRef = useRef(false);

  /* ---- load the campaign once the page is up, then decide whether to show ---- */
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const load = async () => {
      try {
        const res = await customerApi.getSpinCampaign();
        if (cancelled) return;
        const data = res.data?.result;
        if (!data?.active || !data.showPopup || !data.campaign) return;

        const eligible = data.eligibility || {};
        // logged-in but cannot spin any more / not eligible: nothing to show
        if (isAuthenticated && !eligible.canSpin) return;
        if (!frequencyAllowsPopup(data.campaign)) return;

        setCampaign(data.campaign);
        setEligibility(eligible);

        const delay = Math.max(0, Number(data.campaign.popup?.delaySeconds ?? 3)) * 1000;
        timer = setTimeout(() => {
          if (cancelled) return;
          markPopupShown(data.campaign);
          setOpen(true);
          customerApi
            .trackSpinImpression({ campaignId: data.campaign.id, viewerKey: viewerKey() })
            .catch(() => {});
        }, delay);
      } catch {
        // popup is optional: a failed request must never get in the customer's way
      }
    };

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isAuthenticated]);

  /* ---- modal behaviour: scroll lock, ESC, initial focus ---- */
  const close = useCallback(() => {
    if (busyRef.current) return;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  /* ---- spinning ---- */
  const handleSpin = async () => {
    if (busyRef.current || !campaign) return;

    if (!isAuthenticated) {
      setOpen(false);
      navigate("/login", { state: { from: routerLocation } });
      return;
    }

    busyRef.current = true;
    setError("");
    setPhase("spinning");
    if (!spinKeyRef.current) spinKeyRef.current = newKey();
    wheelRef.current?.startWaiting();

    try {
      const res = await customerApi.playSpin(spinKeyRef.current);
      const data = res.data?.result;
      if (!data) throw new Error("Empty response");

      // the wheel only animates to what the server decided
      wheelRef.current?.landOn(data.segmentIndex, () => {
        setResult(data);
        setEligibility((prev) => ({
          ...(prev || {}),
          remainingSpins: data.remainingSpins,
          canSpin: data.remainingSpins > 0,
        }));
        setPhase("result");
        busyRef.current = false;
        window.dispatchEvent(new CustomEvent("spinwin:changed"));
      });
      spinKeyRef.current = null; // next click is a new spin
    } catch (err) {
      wheelRef.current?.stop();
      busyRef.current = false;
      setPhase("idle");
      const status = err.response?.status;
      const message = err.response?.data?.message;
      if (status === 401) {
        setOpen(false);
        navigate("/login", { state: { from: routerLocation } });
      } else if (status === 429 || status === 403 || status === 404 || status === 409) {
        spinKeyRef.current = null;
        if (status === 429 || status === 403) {
          setEligibility((prev) => ({ ...(prev || {}), canSpin: false, remainingSpins: 0 }));
        }
        setError(message || "You can't spin right now.");
      } else {
        // network / server problem: keep the same key so a retry can never issue a second reward
        setError("We couldn't reach the server. Check your connection and tap Spin to try again.");
      }
    }
  };

  const resetForAnotherSpin = () => {
    setResult(null);
    setPhase("idle");
    setError("");
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(result?.reward?.code || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the code is still visible */
    }
  };

  const goToRewards = () => {
    setOpen(false);
    navigate("/rewards");
  };

  if (!open || !campaign) return null;

  const spinning = phase === "spinning";
  const canSpin = eligibility?.canSpin !== false;
  const won = result?.outcome === "reward" && result.reward;
  const remaining = eligibility?.remainingSpins;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="spin-backdrop"
        className="fixed inset-0 z-[300] flex items-end justify-center bg-slate-900/70 backdrop-blur-sm sm:items-center sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="spin-title"
          className="relative flex max-h-[94vh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]"
          initial={{ y: 60, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-[var(--brand-700)] via-primary to-[var(--brand-400)] px-6 pb-12 pt-6 text-center text-white">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-white/10 blur-xl" />
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              disabled={spinning}
              aria-label="Close"
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition hover:bg-white/30 disabled:opacity-40"
            >
              <X size={18} strokeWidth={3} />
            </button>
            {campaign.bannerImage ? (
              <img
                src={campaign.bannerImage}
                alt=""
                className="mx-auto mb-3 h-16 w-auto max-w-[70%] object-contain"
                loading="lazy"
              />
            ) : (
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
                <Gift size={26} />
              </div>
            )}
            <h2 id="spin-title" className="text-2xl font-black tracking-tight">
              {phase === "result" ? (won ? "Congratulations!" : "Almost there!") : campaign.title || "Spin & Win"}
            </h2>
            {phase !== "result" && campaign.description && (
              <p className="mx-auto mt-1 max-w-[18rem] text-sm font-medium text-white/85">{campaign.description}</p>
            )}
          </div>

          {/* body */}
          <div className="-mt-7 flex-1 overflow-y-auto rounded-t-[2rem] bg-white px-5 pb-5 pt-6">
            {phase !== "result" ? (
              <>
                <div className="px-2">
                  <SpinWheel
                    ref={wheelRef}
                    slices={campaign.slices}
                    disabled={spinning || !canSpin}
                    onSpinClick={handleSpin}
                  />
                </div>

                {error && (
                  <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-600">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSpin}
                  disabled={spinning || (isAuthenticated && !canSpin)}
                  className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-black uppercase tracking-wider text-white shadow-lg shadow-primary/30 transition enabled:active:scale-[0.98] disabled:opacity-60"
                >
                  {spinning ? (
                    <>
                      <Loader2 className="animate-spin" size={20} /> Spinning...
                    </>
                  ) : !isAuthenticated ? (
                    "Login to spin"
                  ) : !canSpin ? (
                    "No spins left"
                  ) : (
                    <>
                      <RotateCw size={20} /> Spin now
                    </>
                  )}
                </button>

                {isAuthenticated && typeof remaining === "number" && canSpin && (
                  <p className="mt-2 text-center text-xs font-semibold text-slate-500">
                    {remaining} {remaining === 1 ? "spin" : "spins"} left
                  </p>
                )}
              </>
            ) : (
              <ResultCard
                result={result}
                won={won}
                copied={copied}
                onCopy={copyCode}
                onViewRewards={goToRewards}
                onContinue={() => setOpen(false)}
                canSpinAgain={(eligibility?.remainingSpins || 0) > 0}
                onSpinAgain={resetForAnotherSpin}
              />
            )}

            {campaign.terms && phase !== "result" && (
              <div className="mt-5 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowTerms((v) => !v)}
                  aria-expanded={showTerms}
                  className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Terms &amp; conditions
                  <ChevronDown size={16} className={`transition-transform ${showTerms ? "rotate-180" : ""}`} />
                </button>
                {showTerms && (
                  <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-500">{campaign.terms}</p>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
};

const ResultCard = ({ result, won, copied, onCopy, onViewRewards, onContinue, canSpinAgain, onSpinAgain }) => {
  if (!won) {
    return (
      <div className="py-4 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-4xl">🍀</div>
        <h3 className="text-xl font-black text-slate-800">{result?.label || "Better luck next time"}</h3>
        <p className="mx-auto mt-1 max-w-xs text-sm font-medium text-slate-500">
          No reward this time. Keep shopping, there will be more chances to win.
        </p>
        <div className="mt-6 space-y-3">
          {canSpinAgain && (
            <button
              type="button"
              onClick={onSpinAgain}
              className="h-12 w-full rounded-2xl bg-primary text-sm font-black uppercase tracking-wider text-white"
            >
              Spin again
            </button>
          )}
          <button
            type="button"
            onClick={onContinue}
            className="h-12 w-full rounded-2xl border border-slate-200 text-sm font-black uppercase tracking-wider text-slate-700"
          >
            Continue shopping
          </button>
        </div>
      </div>
    );
  }

  const reward = result.reward;
  const isCashback = reward.type === "wallet_cashback";

  return (
    <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
      <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-4xl ring-4 ring-brand-100">
        {iconFor({ type: reward.type })}
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">You won</p>
      <h3 className="mt-1 text-3xl font-black tracking-tight text-primary">{reward.label}</h3>

      {!isCashback && (
        <button
          type="button"
          onClick={onCopy}
          className="mx-auto mt-4 flex items-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-brand-50 px-4 py-2 font-mono text-sm font-black tracking-widest text-primary"
          aria-label="Copy reward code"
        >
          {reward.code}
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      )}

      <ul className="mx-auto mt-4 max-w-xs space-y-1.5 text-left text-xs font-medium text-slate-600">
        {rewardConditions(reward).map((line) => (
          <li key={line} className="flex gap-2">
            <span className="mt-0.5 text-primary">•</span>
            {line}
          </li>
        ))}
        {!isCashback && reward.expiresAt && (
          <li className="flex gap-2 font-bold text-slate-700">
            <span className="mt-0.5 text-primary">•</span>
            Use before {formatExpiry(reward.expiresAt)}
          </li>
        )}
      </ul>

      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={onViewRewards}
          className="h-12 w-full rounded-2xl bg-primary text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-primary/30"
        >
          View my rewards
        </button>
        {canSpinAgain && (
          <button
            type="button"
            onClick={onSpinAgain}
            className="h-12 w-full rounded-2xl border border-primary/40 text-sm font-black uppercase tracking-wider text-primary"
          >
            Spin again
          </button>
        )}
        <button
          type="button"
          onClick={onContinue}
          className="h-12 w-full rounded-2xl border border-slate-200 text-sm font-black uppercase tracking-wider text-slate-700"
        >
          Continue shopping
        </button>
      </div>
    </motion.div>
  );
};

export default SpinWinPopup;
