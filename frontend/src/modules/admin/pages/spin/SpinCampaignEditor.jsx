import React, { useCallback, useEffect, useRef, useState } from "react";
import Modal from "@shared/components/ui/Modal";
import Badge from "@shared/components/ui/Badge";
import ImageSpecHint, { checkImageSpec } from "@shared/components/ui/ImageSpecHint";
import { useToast } from "@shared/components/ui/Toast";
import {
  HiOutlineArrowDown,
  HiOutlineArrowUp,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineTrash,
} from "react-icons/hi2";
import { cn } from "@/lib/utils";
import SpinWheel from "@/modules/customer/components/spin/SpinWheel";
import { iconFor } from "@/modules/customer/components/spin/spinTheme";
import { adminApi } from "../../services/adminApi";
import SpinRewardForm, { REWARD_TYPE_INFO } from "./SpinRewardForm";

export const STATUS_BADGE = {
  draft: ["gray", "Draft"],
  scheduled: ["info", "Scheduled"],
  active: ["success", "Active"],
  paused: ["warning", "Paused"],
  completed: ["gray", "Completed"],
};

const TABS = [
  { id: "details", label: "Details" },
  { id: "rewards", label: "Rewards" },
  { id: "preview", label: "Preview" },
  { id: "history", label: "History" },
];

// <input type="datetime-local"> works in local time, the API uses ISO strings
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);

const emptyForm = {
  name: "",
  title: "Spin & Win",
  description: "",
  bannerImage: "",
  startAt: "",
  endAt: "",
  popupDelay: 3,
  popupFrequency: "every_session",
  requireLogin: true,
  audience: "all",
  minOrders: 1,
  maxSpins: 1,
  period: "campaign",
  rewardValidityDays: 7,
  terms: "",
};

const formFromCampaign = (c) => ({
  name: c.name || "",
  title: c.title || "",
  description: c.description || "",
  bannerImage: c.bannerImage || "",
  startAt: toLocalInput(c.startAt),
  endAt: toLocalInput(c.endAt),
  popupDelay: c.popup?.delaySeconds ?? 3,
  popupFrequency: c.popup?.frequency || "every_session",
  requireLogin: c.requireLogin !== false,
  audience: c.eligibility?.audience || "all",
  minOrders: c.eligibility?.minOrders ?? 1,
  maxSpins: c.participation?.maxSpins ?? 1,
  period: c.participation?.period || "campaign",
  rewardValidityDays: c.rewardValidityDays ?? 7,
  terms: c.terms || "",
});

const payloadFromForm = (f) => ({
  name: f.name.trim(),
  title: f.title.trim(),
  description: f.description.trim(),
  bannerImage: f.bannerImage.trim(),
  startAt: fromLocalInput(f.startAt),
  endAt: fromLocalInput(f.endAt),
  popup: { delaySeconds: Number(f.popupDelay) || 0, frequency: f.popupFrequency },
  requireLogin: f.requireLogin,
  eligibility: { audience: f.audience, minOrders: Number(f.minOrders) || 0 },
  participation: { maxSpins: Math.max(1, Number(f.maxSpins) || 1), period: f.period },
  rewardValidityDays: Math.max(1, Number(f.rewardValidityDays) || 7),
  terms: f.terms.trim(),
});

const Field = ({ label, help, children, className }) => (
  <div className={cn("space-y-1.5", className)}>
    <label className="ds-label">{label}</label>
    {children}
    {help && <p className="text-[11px] font-medium text-slate-400">{help}</p>}
  </div>
);

const rewardSummary = (r) => {
  switch (r.type) {
    case "fixed":
    case "wallet_cashback":
      return `₹${r.value}`;
    case "percentage":
      return `${r.value}%`;
    default:
      return "-";
  }
};

const SpinCampaignEditor = ({ isOpen, campaignId, onClose, onChanged }) => {
  const { showToast } = useToast();
  const [id, setId] = useState(campaignId);
  const [campaign, setCampaign] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [tab, setTab] = useState("details");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rewardModal, setRewardModal] = useState({ open: false, reward: null });
  const fileRef = useRef(null);

  const load = useCallback(
    async (targetId) => {
      if (!targetId) return;
      setLoading(true);
      try {
        const res = await adminApi.getSpinCampaign(targetId);
        const data = res.data?.result;
        setCampaign(data);
        setForm(formFromCampaign(data));
      } catch (e) {
        showToast(e.response?.data?.message || "Could not load the campaign", "error");
      } finally {
        setLoading(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    if (!isOpen) return;
    setId(campaignId);
    setTab("details");
    if (campaignId) load(campaignId);
    else {
      setCampaign(null);
      setForm(emptyForm);
    }
  }, [isOpen, campaignId, load]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const locked = campaign?.status === "completed";
  const status = campaign?.effectiveStatus || campaign?.status || "draft";

  const save = async () => {
    if (form.name.trim().length < 2) return showToast("Give the campaign a name", "warning");
    if (form.startAt && form.endAt && new Date(form.endAt) <= new Date(form.startAt)) {
      return showToast("The end date must be after the start date", "warning");
    }
    setSaving(true);
    try {
      if (id) {
        await adminApi.updateSpinCampaign(id, payloadFromForm(form));
        showToast("Campaign saved", "success");
        await load(id);
      } else {
        const res = await adminApi.createSpinCampaign(payloadFromForm(form));
        const created = res.data?.result;
        showToast("Campaign created. Now add the rewards for the wheel.", "success");
        setId(created._id);
        await load(created._id);
        setTab("rewards");
      }
      onChanged?.();
    } catch (e) {
      showToast(e.response?.data?.message || "Could not save the campaign", "error");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (next, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setStatusBusy(true);
    try {
      await adminApi.setSpinCampaignStatus(id, next);
      showToast("Status updated", "success");
      await load(id);
      onChanged?.();
    } catch (e) {
      showToast(e.response?.data?.message || "Could not change the status", "error");
    } finally {
      setStatusBusy(false);
    }
  };

  const uploadBanner = async (file) => {
    if (!file) return;
    const warning = await checkImageSpec(file, "spinBanner");
    if (warning) showToast(warning, "warning");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await adminApi.uploadExperienceBanner(fd);
      const url = res.data?.result?.url || res.data?.url;
      if (!url) throw new Error("Upload failed");
      set({ bannerImage: url });
    } catch {
      showToast("Image upload failed", "error");
    } finally {
      setUploading(false);
    }
  };

  const moveReward = async (index, direction) => {
    const rewards = [...campaign.rewards];
    const target = index + direction;
    if (target < 0 || target >= rewards.length) return;
    [rewards[index], rewards[target]] = [rewards[target], rewards[index]];
    setCampaign((c) => ({ ...c, rewards }));
    try {
      await adminApi.reorderSpinRewards(id, rewards.map((r) => r._id));
      await load(id);
    } catch (e) {
      showToast(e.response?.data?.message || "Could not save the order", "error");
      load(id);
    }
  };

  const removeReward = async (reward) => {
    const text =
      reward.awardedCount > 0
        ? `"${reward.label}" was already won ${reward.awardedCount} time(s). It will be deactivated (history is kept). Continue?`
        : `Delete "${reward.label}" from the wheel?`;
    if (!window.confirm(text)) return;
    try {
      const res = await adminApi.deleteSpinReward(reward._id);
      showToast(res.data?.message || "Reward removed", "success");
      load(id);
      onChanged?.();
    } catch (e) {
      showToast(e.response?.data?.message || "Could not remove the reward", "error");
    }
  };

  const totalWeight = (campaign?.rewards || [])
    .filter((r) => r.isActive)
    .reduce((sum, r) => sum + (Number(r.weight) || 0), 0);

  const statusActions = id && campaign && !locked && (
    <div className="flex flex-wrap items-center gap-2">
      {["draft", "paused"].includes(campaign.status) && (
        <button
          type="button"
          disabled={statusBusy}
          onClick={() => changeStatus("active")}
          className="rounded-xl bg-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60"
        >
          {campaign.status === "paused" ? "Resume" : "Activate"}
        </button>
      )}
      {["active", "scheduled"].includes(campaign.status) && (
        <button
          type="button"
          disabled={statusBusy}
          onClick={() => changeStatus("paused")}
          className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60"
        >
          Pause
        </button>
      )}
      {campaign.status !== "draft" && (
        <button
          type="button"
          disabled={statusBusy}
          onClick={() => changeStatus("completed", "End this campaign now? It cannot be started again.")}
          className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-600 disabled:opacity-60"
        >
          End campaign
        </button>
      )}
    </div>
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="xl"
        title={id ? campaign?.name || "Campaign" : "New campaign"}
        footer={
          tab === "details" && !locked ? (
            <>
              <button type="button" onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100">
                Close
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-black text-white disabled:opacity-60"
              >
                {saving ? "Saving..." : id ? "Save changes" : "Create campaign"}
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100">
              Close
            </button>
          )
        }
      >
        {loading ? (
          <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
        ) : (
          <div className="space-y-5">
            {id && campaign && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_BADGE[status]?.[0]}>{STATUS_BADGE[status]?.[1] || status}</Badge>
                  <span className="text-xs font-medium text-slate-500">
                    {campaign.spinCount || 0} spins · {(campaign.rewards || []).filter((r) => r.isActive).length} active rewards
                  </span>
                </div>
                {statusActions}
              </div>
            )}

            <div role="tablist" className="flex gap-1 rounded-xl bg-slate-100 p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  type="button"
                  disabled={!id && t.id !== "details"}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex-1 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wider transition disabled:opacity-40",
                    tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "details" && (
              <fieldset disabled={locked} className="space-y-5">
                {locked && <p className="rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-500">This campaign has ended and can no longer be edited.</p>}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Campaign name" help="Only you see this name.">
                    <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Diwali Spin & Win" className="ds-input w-full" />
                  </Field>
                  <Field label="Popup title" help="Shown to customers on the popup.">
                    <input value={form.title} onChange={(e) => set({ title: e.target.value })} className="ds-input w-full" />
                  </Field>
                </div>
                <Field label="Popup description">
                  <input value={form.description} maxLength={500} onChange={(e) => set({ description: e.target.value })} placeholder="Spin the wheel and win exciting rewards!" className="ds-input w-full" />
                </Field>

                <div className="space-y-2">
                  <label className="ds-label">Popup logo / banner (optional)</label>
                  <div className="flex items-center gap-3">
                    {form.bannerImage && <img src={form.bannerImage} alt="" className="h-12 max-w-[9rem] rounded-lg bg-slate-50 object-contain p-1 ring-1 ring-slate-200" />}
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadBanner(e.target.files?.[0])} />
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-60">
                      {uploading ? "Uploading..." : form.bannerImage ? "Change image" : "Upload image"}
                    </button>
                    {form.bannerImage && (
                      <button type="button" onClick={() => set({ bannerImage: "" })} className="text-xs font-bold text-slate-400 hover:text-red-500">
                        Remove
                      </button>
                    )}
                  </div>
                  <ImageSpecHint type="spinBanner" compact />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Starts" help="Campaign goes live automatically at this time once activated.">
                    <input type="datetime-local" value={form.startAt} onChange={(e) => set({ startAt: e.target.value })} className="ds-input w-full" />
                  </Field>
                  <Field label="Ends">
                    <input type="datetime-local" value={form.endAt} onChange={(e) => set({ endAt: e.target.value })} className="ds-input w-full" />
                  </Field>
                </div>

                <div className="rounded-2xl border border-slate-100 p-4">
                  <h4 className="mb-3 text-sm font-black text-slate-800">Popup behaviour</h4>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Show after (seconds)">
                      <input type="number" min="0" max="60" value={form.popupDelay} onChange={(e) => set({ popupDelay: e.target.value })} className="ds-input w-full" />
                    </Field>
                    <Field label="How often">
                      <select value={form.popupFrequency} onChange={(e) => set({ popupFrequency: e.target.value })} className="ds-input w-full">
                        <option value="every_session">Once every app visit</option>
                        <option value="daily">At most once a day</option>
                        <option value="weekly">At most once a week</option>
                        <option value="once">Only once, ever</option>
                      </select>
                    </Field>
                    <Field label="Logged-out visitors">
                      <select value={form.requireLogin ? "hide" : "show"} onChange={(e) => set({ requireLogin: e.target.value === "hide" })} className="ds-input w-full">
                        <option value="hide">Hide popup until they log in</option>
                        <option value="show">Show it and ask them to log in to spin</option>
                      </select>
                    </Field>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 p-4">
                  <h4 className="mb-3 text-sm font-black text-slate-800">Who can spin</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Audience">
                      <select value={form.audience} onChange={(e) => set({ audience: e.target.value })} className="ds-input w-full">
                        <option value="all">All customers</option>
                        <option value="new_customers">New customers (no orders yet)</option>
                        <option value="existing_customers">Existing customers (with orders)</option>
                      </select>
                    </Field>
                    {form.audience === "existing_customers" && (
                      <Field label="Minimum previous orders">
                        <input type="number" min="1" value={form.minOrders} onChange={(e) => set({ minOrders: e.target.value })} className="ds-input w-full" />
                      </Field>
                    )}
                    <Field label="Spins allowed per customer">
                      <input type="number" min="1" value={form.maxSpins} onChange={(e) => set({ maxSpins: e.target.value })} className="ds-input w-full" />
                    </Field>
                    <Field label="Counted per">
                      <select value={form.period} onChange={(e) => set({ period: e.target.value })} className="ds-input w-full">
                        <option value="campaign">Whole campaign</option>
                        <option value="day">Day</option>
                        <option value="week">Week</option>
                        <option value="month">Month</option>
                      </select>
                    </Field>
                    <Field label="Default reward validity (days)" help="Used when a reward does not set its own.">
                      <input type="number" min="1" max="365" value={form.rewardValidityDays} onChange={(e) => set({ rewardValidityDays: e.target.value })} className="ds-input w-full" />
                    </Field>
                  </div>
                </div>

                <Field label="Terms & conditions" help="Shown to customers under the wheel.">
                  <textarea value={form.terms} onChange={(e) => set({ terms: e.target.value })} rows={4} maxLength={4000} className="ds-input w-full" placeholder="One reward per order. Cannot be combined with other offers..." />
                </Field>
              </fieldset>
            )}

            {tab === "rewards" && campaign && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500">
                    The wheel shows the active rewards in this order. Chance = weight ÷ total weight of active rewards.
                  </p>
                  {!locked && (
                    <button
                      type="button"
                      onClick={() => setRewardModal({ open: true, reward: null })}
                      className="flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-wider text-white"
                    >
                      <HiOutlinePlus className="h-4 w-4" /> Add reward
                    </button>
                  )}
                </div>

                {campaign.setErrors?.length > 0 && (
                  <ul className="space-y-1 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-700">
                    {campaign.setErrors.map((e) => (
                      <li key={e}>• {e}</li>
                    ))}
                  </ul>
                )}

                {campaign.rewards?.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center text-sm font-semibold text-slate-400">
                    No rewards yet. Add at least two to build the wheel.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-100">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3 py-3">Reward</th>
                          <th className="px-3 py-3">Chance</th>
                          <th className="px-3 py-3">Won / limit</th>
                          <th className="px-3 py-3">Rules</th>
                          <th className="px-3 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {campaign.rewards.map((r, index) => (
                          <tr key={r._id} className={cn(!r.isActive && "opacity-50")}>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2.5">
                                <span
                                  className="flex h-9 w-9 items-center justify-center rounded-lg text-lg"
                                  style={{ background: r.color || "var(--brand-100)" }}
                                >
                                  {iconFor(r)}
                                </span>
                                <div>
                                  <p className="font-bold text-slate-800">{r.label}</p>
                                  <p className="text-[11px] font-medium text-slate-400">
                                    {REWARD_TYPE_INFO[r.type]?.label} {rewardSummary(r) !== "-" ? `· ${rewardSummary(r)}` : ""}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 font-black text-primary">{r.probability}%</td>
                            <td className="px-3 py-3 text-xs font-semibold text-slate-600">
                              {r.awardedCount} / {r.totalQuantity ?? "∞"}
                            </td>
                            <td className="px-3 py-3 text-[11px] font-medium text-slate-500">
                              {r.minCartValue > 0 && <div>Min ₹{r.minCartValue}</div>}
                              {r.maxDiscount != null && <div>Max ₹{r.maxDiscount}</div>}
                              {r.perCustomerLimit != null && <div>{r.perCustomerLimit}/customer</div>}
                              {!r.isActive && <div className="font-bold text-red-500">Inactive</div>}
                            </td>
                            <td className="px-3 py-3">
                              {!locked && (
                                <div className="flex justify-end gap-1">
                                  <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => moveReward(index, -1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
                                    <HiOutlineArrowUp className="h-4 w-4" />
                                  </button>
                                  <button type="button" aria-label="Move down" disabled={index === campaign.rewards.length - 1} onClick={() => moveReward(index, 1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
                                    <HiOutlineArrowDown className="h-4 w-4" />
                                  </button>
                                  <button type="button" aria-label="Edit" onClick={() => setRewardModal({ open: true, reward: r })} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                                    <HiOutlinePencilSquare className="h-4 w-4" />
                                  </button>
                                  <button type="button" aria-label="Remove" onClick={() => removeReward(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                                    <HiOutlineTrash className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {tab === "preview" && campaign && (
              <div className="mx-auto max-w-sm space-y-4 rounded-3xl bg-gradient-to-br from-[var(--brand-700)] via-primary to-[var(--brand-400)] p-6 text-center text-white">
                {campaign.bannerImage && <img src={campaign.bannerImage} alt="" className="mx-auto h-14 max-w-[70%] object-contain" />}
                <h3 className="text-2xl font-black">{campaign.title || "Spin & Win"}</h3>
                {campaign.description && <p className="text-sm font-medium text-white/85">{campaign.description}</p>}
                <div className="rounded-3xl bg-white p-4">
                  {campaign.preview?.slices?.length >= 2 ? (
                    <SpinWheel slices={campaign.preview.slices} disabled />
                  ) : (
                    <p className="py-10 text-sm font-semibold text-slate-400">Add at least 2 active rewards to preview the wheel.</p>
                  )}
                </div>
                <p className="text-[11px] font-semibold text-white/70">This is exactly what customers see. Spinning is disabled in preview.</p>
              </div>
            )}

            {tab === "history" && campaign && (
              <ol className="space-y-2">
                {[...(campaign.auditLog || [])].reverse().map((entry, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-4 py-2.5 text-xs">
                    <span className="font-semibold text-slate-700">
                      <span className="mr-2 rounded bg-white px-1.5 py-0.5 font-black uppercase tracking-wider text-slate-500">{entry.action}</span>
                      {entry.summary}
                    </span>
                    <time className="shrink-0 font-medium text-slate-400">{new Date(entry.at).toLocaleString("en-IN")}</time>
                  </li>
                ))}
                {!campaign.auditLog?.length && <li className="text-sm font-semibold text-slate-400">No changes recorded yet.</li>}
              </ol>
            )}
          </div>
        )}
      </Modal>

      <SpinRewardForm
        isOpen={rewardModal.open}
        reward={rewardModal.reward}
        campaignId={id}
        totalWeight={totalWeight}
        onClose={() => setRewardModal({ open: false, reward: null })}
        onSaved={() => {
          load(id);
          onChanged?.();
        }}
      />
    </>
  );
};

export default SpinCampaignEditor;
