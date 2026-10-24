import React, { useCallback, useEffect, useState } from "react";
import Card from "@shared/components/ui/Card";
import { useToast } from "@shared/components/ui/Toast";
import { cn } from "@/lib/utils";

// Monday first, as shop owners read a week
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      })
    : "";

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

function modeText(timing) {
  const { status, scheduleEnabled } = timing;
  if (status.mode === "manual") {
    if (status.isOpen) {
      return status.closesAt
        ? `Opened manually · closes again at ${formatDateTime(status.closesAt)}`
        : "Opened manually";
    }
    return status.opensAt
      ? `Closed manually · opens again at ${formatDateTime(status.opensAt)}`
      : "Closed manually until it is reopened";
  }
  if (status.mode === "schedule") return "Following the weekly opening hours";
  return scheduleEnabled ? "" : "No opening hours set, so the shop is open 24×7";
}

/**
 * Open / close switch and weekly opening hours for one shop.
 * Used by the seller panel (own shop) and the admin panel (any shop).
 * api: { get(), saveHours(payload), setStatus({ action, keepClosed }) }, each returning an axios promise.
 */
const ShopTimingEditor = ({ api, ownerLabel = "your shop" }) => {
  const { showToast } = useToast();
  const [timing, setTiming] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [keepClosed, setKeepClosed] = useState(false);

  const apply = useCallback((data) => {
    setTiming(data);
    setForm({ scheduleEnabled: data.scheduleEnabled, weeklyHours: data.weeklyHours, note: data.note || "" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get()
      .then((res) => !cancelled && apply(res.data?.result))
      .catch((e) => !cancelled && setError(e.response?.data?.message || "Could not load shop timings"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The label ("Closes at 10 PM") depends on the clock, so refresh it while the page is open
  useEffect(() => {
    const timer = setInterval(() => {
      api.get().then((res) => setTiming(res.data?.result)).catch(() => {});
    }, 60 * 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setStatus = async (action) => {
    setBusy(action);
    try {
      const res = await api.setStatus({ action, keepClosed });
      setTiming(res.data?.result);
      showToast(res.data?.message || "Saved", "success");
    } catch (e) {
      showToast(e.response?.data?.message || "Could not change the shop status", "error");
    } finally {
      setBusy("");
    }
  };

  const saveHours = async () => {
    setBusy("hours");
    try {
      const res = await api.saveHours(form);
      apply(res.data?.result);
      showToast("Opening hours saved", "success");
    } catch (e) {
      showToast(e.response?.data?.message || "Could not save opening hours", "error");
    } finally {
      setBusy("");
    }
  };

  const setDay = (day, patch) =>
    setForm((f) => ({ ...f, weeklyHours: f.weeklyHours.map((d) => (d.day === day ? { ...d, ...patch } : d)) }));

  const copyMondayToAll = () =>
    setForm((f) => {
      const monday = f.weeklyHours.find((d) => d.day === 1);
      return { ...f, weeklyHours: f.weeklyHours.map((d) => ({ ...monday, day: d.day })) };
    });

  if (error) return <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-600">{error}</p>;
  if (!timing || !form) return <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />;

  const { status } = timing;
  const dirty =
    form.scheduleEnabled !== timing.scheduleEnabled ||
    form.note !== (timing.note || "") ||
    JSON.stringify(form.weeklyHours) !== JSON.stringify(timing.weeklyHours);

  return (
    <div className="space-y-6">
      {/* Live status + switch */}
      <Card className={cn("border-none shadow-lg ring-1", status.isOpen ? "bg-emerald-50/60 ring-emerald-100" : "bg-rose-50/60 ring-rose-100")}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span
              className={cn(
                "mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full ring-4",
                status.isOpen ? "bg-emerald-500 ring-emerald-100" : "bg-rose-500 ring-rose-100",
              )}
            />
            <div>
              <p className="text-xl font-black text-slate-900">{status.isOpen ? "Open now" : "Closed now"}</p>
              <p className="text-sm font-bold text-slate-600">{status.label}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{modeText(timing)}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {status.isOpen
                  ? "Customers can order now."
                  : "Customers can still see products, but cannot add them to the cart or place orders."}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            {status.isOpen ? (
              <>
                <button
                  type="button"
                  onClick={() => setStatus("close")}
                  disabled={!!busy}
                  className="rounded-xl bg-rose-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-rose-700 disabled:opacity-60"
                >
                  {busy === "close" ? "Closing..." : "Close shop now"}
                </button>
                {timing.scheduleEnabled && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={keepClosed}
                      onChange={(e) => setKeepClosed(e.target.checked)}
                      className="h-4 w-4 accent-rose-600"
                    />
                    Keep closed until reopened (holiday)
                  </label>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setStatus("open")}
                disabled={!!busy}
                className="rounded-xl bg-emerald-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {busy === "open" ? "Opening..." : "Open shop now"}
              </button>
            )}
            {status.mode === "manual" && timing.scheduleEnabled && (
              <button
                type="button"
                onClick={() => setStatus("auto")}
                disabled={!!busy}
                className="text-xs font-bold text-primary underline-offset-2 hover:underline disabled:opacity-60"
              >
                Go back to the weekly hours
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Weekly hours */}
      <Card
        className="border-none bg-white shadow-lg ring-1 ring-slate-100"
        title="Weekly opening hours"
        subtitle={`Open and close ${ownerLabel} automatically. Times are India time (IST).`}
        headerAction={
          <Switch
            checked={form.scheduleEnabled}
            onChange={(scheduleEnabled) => setForm((f) => ({ ...f, scheduleEnabled }))}
            label="Use weekly opening hours"
          />
        }
      >
        {!form.scheduleEnabled ? (
          <p className="text-sm font-medium text-slate-500">
            Weekly hours are off, so the shop stays open round the clock unless it is closed with the button above.
            Turn the switch on to set opening hours.
          </p>
        ) : (
          <div className="space-y-2">
            {DAY_ORDER.map((day) => {
              const entry = form.weeklyHours.find((d) => d.day === day);
              const overnight = entry.isOpen && entry.close <= entry.open && entry.close !== entry.open;
              const allDay = entry.isOpen && entry.close === entry.open;
              return (
                <div
                  key={day}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5",
                    entry.isOpen ? "bg-slate-50" : "bg-slate-50/50",
                  )}
                >
                  <span className="w-24 text-sm font-bold text-slate-800">{DAY_NAMES[day]}</span>
                  <Switch
                    checked={entry.isOpen}
                    onChange={(isOpen) => setDay(day, { isOpen })}
                    label={`${DAY_NAMES[day]} open`}
                  />
                  {entry.isOpen ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        value={entry.open}
                        onChange={(e) => setDay(day, { open: e.target.value })}
                        aria-label={`${DAY_NAMES[day]} opening time`}
                        className="ds-input w-[120px]"
                      />
                      <span className="text-xs font-bold text-slate-400">to</span>
                      <input
                        type="time"
                        value={entry.close}
                        onChange={(e) => setDay(day, { close: e.target.value })}
                        aria-label={`${DAY_NAMES[day]} closing time`}
                        className="ds-input w-[120px]"
                      />
                      {overnight && <span className="text-[11px] font-semibold text-amber-600">closes after midnight</span>}
                      {allDay && <span className="text-[11px] font-semibold text-emerald-600">open all day</span>}
                    </div>
                  ) : (
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Closed all day</span>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={copyMondayToAll}
              className="mt-1 text-xs font-bold text-primary underline-offset-2 hover:underline"
            >
              Copy Monday's hours to every day
            </button>
          </div>
        )}

        <div className="mt-6 space-y-1.5">
          <label className="ds-label" htmlFor="shop-closed-note">Message for customers while closed (optional)</label>
          <input
            id="shop-closed-note"
            value={form.note}
            maxLength={120}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="E.g. Closed for Diwali, back on Monday"
            className="ds-input w-full"
          />
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          {dirty && <span className="text-xs font-semibold text-amber-600">Unsaved changes</span>}
          <button
            type="button"
            onClick={saveHours}
            disabled={!dirty || busy === "hours"}
            className="rounded-xl bg-slate-900 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-50"
          >
            {busy === "hours" ? "Saving..." : "Save hours"}
          </button>
        </div>
      </Card>

      {timing.updatedAt && (
        <p className="text-right text-[11px] font-medium text-slate-400">
          Last changed by {timing.updatedByRole === "admin" ? "admin" : "seller"} on{" "}
          {new Date(timing.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
        </p>
      )}
    </div>
  );
};

export default ShopTimingEditor;
