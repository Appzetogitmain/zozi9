import React, { useEffect, useState } from "react";
import Card from "@shared/components/ui/Card";
import { useToast } from "@shared/components/ui/Toast";
import { cn } from "@/lib/utils";
import { adminApi } from "../../services/adminApi";

const OPTIONS = [
  {
    key: "enabled",
    title: "Spin & Win is live",
    help: "Master switch. When off, no new spins are allowed and the popup is hidden everywhere.",
    strong: true,
  },
  {
    key: "popupEnabled",
    title: "Show popup when the app opens",
    help: "Turn this off to keep the campaign running without interrupting customers (they can still be sent a link).",
  },
  {
    key: "allowRedemptionWhenDisabled",
    title: "Let customers use rewards they already won while Spin & Win is off",
    help: "Recommended. Rewards still follow their own expiry date.",
  },
  {
    key: "autoApplyReward",
    title: "Automatically apply the best reward at checkout",
    help: "Only when the cart qualifies. Customers can always remove it or pick another one.",
  },
  {
    key: "restoreOnCancel",
    title: "Give the reward back when an order is cancelled or payment fails",
    help: "The reward returns only if it has not expired. With several seller orders in one checkout, it returns once all of them are cancelled.",
  },
  {
    key: "restoreOnRefund",
    title: "Give the reward back after a full return and refund",
    help: "Off by default. Applies only when every item of the order is returned.",
  },
];

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

const SpinSettingsPanel = ({ onChanged }) => {
  const { showToast } = useToast();
  const [settings, setSettings] = useState(null);
  const [savingKey, setSavingKey] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    adminApi
      .getSpinSettings()
      .then((res) => !cancelled && setSettings(res.data?.result || {}))
      .catch((e) => !cancelled && setError(e.response?.data?.message || "Could not load settings"));
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (key, value) => {
    const previous = settings[key];
    setSettings((s) => ({ ...s, [key]: value })); // optimistic
    setSavingKey(key);
    try {
      const res = await adminApi.updateSpinSettings({ [key]: value });
      setSettings(res.data?.result || settings);
      onChanged?.(res.data?.result);
      showToast("Saved", "success");
    } catch (e) {
      setSettings((s) => ({ ...s, [key]: previous }));
      showToast(e.response?.data?.message || "Could not save the setting", "error");
    } finally {
      setSavingKey("");
    }
  };

  if (error) return <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-600">{error}</p>;
  if (!settings) return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;

  return (
    <Card className="divide-y divide-slate-100 border-none bg-white p-0 shadow-lg ring-1 ring-slate-100">
      {OPTIONS.map((option) => (
        <div key={option.key} className={cn("flex items-start justify-between gap-6 p-5", option.strong && "bg-brand-50/50")}>
          <div className="min-w-0">
            <h3 className={cn("text-sm text-slate-800", option.strong ? "font-black" : "font-bold")}>{option.title}</h3>
            <p className="mt-1 max-w-xl text-xs font-medium leading-relaxed text-slate-500">{option.help}</p>
          </div>
          <Switch
            checked={!!settings[option.key]}
            disabled={savingKey === option.key}
            onChange={(value) => toggle(option.key, value)}
            label={option.title}
          />
        </div>
      ))}
    </Card>
  );
};

export default SpinSettingsPanel;
