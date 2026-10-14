import React, { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "@shared/components/ui/Modal";
import { useToast } from "@shared/components/ui/Toast";
import { cn } from "@/lib/utils";
import { adminApi } from "../../services/adminApi";
import { ICON_KEYS, iconFor } from "@/modules/customer/components/spin/spinTheme";
import EntityPicker from "./EntityPicker";

export const REWARD_TYPE_INFO = {
  fixed: { label: "Fixed discount (₹ off)", needsValue: true, valueLabel: "Discount amount (₹)", suggest: "e.g. 20" },
  percentage: { label: "Percentage discount (% off)", needsValue: true, valueLabel: "Discount percent (%)", suggest: "e.g. 10" },
  free_delivery: { label: "Free delivery", needsValue: false },
  wallet_cashback: { label: "Wallet cashback", needsValue: true, valueLabel: "Cashback amount (₹)", suggest: "e.g. 25" },
  free_product: { label: "Free product / gift", needsValue: false },
  no_prize: { label: "No prize (Better luck next time)", needsValue: false },
};

const emptyForm = {
  label: "",
  type: "fixed",
  value: "",
  icon: "gift",
  color: "",
  weight: 10,
  minCartValue: "",
  maxDiscount: "",
  totalQuantity: "",
  perCustomerLimit: "",
  validityDays: "",
  eligibleCategoryIds: [],
  eligibleSellerIds: [],
  eligibleProductIds: [],
  freeProductId: "",
  isActive: true,
};

const toNumberOrNull = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

const Field = ({ label, help, children }) => (
  <div className="space-y-1.5">
    <label className="ds-label">{label}</label>
    {children}
    {help && <p className="text-[11px] font-medium text-slate-400">{help}</p>}
  </div>
);

const SpinRewardForm = ({ isOpen, onClose, campaignId, reward, totalWeight, onSaved }) => {
  const { showToast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [labels, setLabels] = useState({});

  const editing = !!reward;
  const info = REWARD_TYPE_INFO[form.type];

  useEffect(() => {
    if (!isOpen) return;
    if (reward) {
      setForm({
        ...emptyForm,
        ...reward,
        value: reward.value ?? "",
        minCartValue: reward.minCartValue || "",
        maxDiscount: reward.maxDiscount ?? "",
        totalQuantity: reward.totalQuantity ?? "",
        perCustomerLimit: reward.perCustomerLimit ?? "",
        validityDays: reward.validityDays ?? "",
        eligibleCategoryIds: (reward.eligibleCategoryIds || []).map(String),
        eligibleSellerIds: (reward.eligibleSellerIds || []).map(String),
        eligibleProductIds: (reward.eligibleProductIds || []).map(String),
        freeProductId: reward.freeProductId ? String(reward.freeProductId) : "",
        color: reward.color || "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [isOpen, reward]);

  // category and seller lists are loaded once, the first time the form opens
  useEffect(() => {
    if (!isOpen || categories.length || sellers.length) return;
    adminApi
      .getCategories()
      .then((res) => {
        const list = res.data?.results || res.data?.result || [];
        setCategories(
          (Array.isArray(list) ? list : [])
            .filter((c) => c.type === "category" || !c.type)
            .map((c) => ({ value: String(c._id), label: c.name })),
        );
      })
      .catch(() => {});
    adminApi
      .getActiveSellers({ limit: 100 })
      .then((res) => {
        const raw = res.data?.result;
        const list = res.data?.results || raw?.items || (Array.isArray(raw) ? raw : []);
        setSellers(list.map((s) => ({ value: String(s._id), label: s.shopName || s.name || s.email || String(s._id) })));
      })
      .catch(() => {});
  }, [isOpen, categories.length, sellers.length]);

  const searchProducts = useCallback(async (term) => {
    const res = await adminApi.getProducts({ search: term, limit: 15 });
    const raw = res.data?.result;
    const list = res.data?.results || raw?.items || (Array.isArray(raw) ? raw : []);
    list.forEach((p) => setLabels((prev) => ({ ...prev, [p._id]: p.name })));
    return list.map((p) => ({ value: String(p._id), label: p.name }));
  }, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const probability = useMemo(() => {
    const w = Number(form.weight) || 0;
    if (!form.isActive || w <= 0) return 0;
    const others = Math.max(0, (totalWeight || 0) - (editing && reward?.isActive ? Number(reward.weight) || 0 : 0));
    const total = others + w;
    return total > 0 ? Math.round((w / total) * 1000) / 10 : 0;
  }, [form.weight, form.isActive, totalWeight, editing, reward]);

  const submit = async () => {
    if (!form.label.trim()) return showToast("Give the slice a label customers will see, e.g. ₹20 OFF", "warning");
    if (info.needsValue && !(Number(form.value) > 0)) return showToast(`${info.valueLabel} must be greater than 0`, "warning");
    if (form.type === "free_product" && !form.freeProductId) return showToast("Pick the free product", "warning");

    const payload = {
      label: form.label.trim(),
      type: form.type,
      value: info.needsValue ? Number(form.value) : 0,
      icon: form.icon,
      color: form.color || "",
      weight: Number(form.weight) || 0,
      minCartValue: Number(form.minCartValue) || 0,
      maxDiscount: toNumberOrNull(form.maxDiscount),
      totalQuantity: toNumberOrNull(form.totalQuantity),
      perCustomerLimit: toNumberOrNull(form.perCustomerLimit),
      validityDays: toNumberOrNull(form.validityDays),
      eligibleCategoryIds: form.eligibleCategoryIds,
      eligibleSellerIds: form.eligibleSellerIds,
      eligibleProductIds: form.eligibleProductIds,
      freeProductId: form.type === "free_product" ? form.freeProductId : null,
      isActive: form.isActive,
    };

    setSaving(true);
    try {
      if (editing) await adminApi.updateSpinReward(reward._id, payload);
      else await adminApi.addSpinReward(campaignId, payload);
      showToast(editing ? "Reward updated" : "Reward added", "success");
      onSaved?.();
      onClose();
    } catch (e) {
      showToast(e.response?.data?.message || "Could not save the reward", "error");
    } finally {
      setSaving(false);
    }
  };

  const isPrize = form.type !== "no_prize";
  const canRestrict = ["fixed", "percentage", "free_delivery", "free_product"].includes(form.type);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={editing ? "Edit reward" : "Add reward"}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-black text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : editing ? "Save changes" : "Add reward"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Label on the wheel" help="Short text shown on the slice (max 40 characters).">
            <input value={form.label} maxLength={40} onChange={(e) => set({ label: e.target.value })} placeholder="₹20 OFF" className="ds-input w-full" />
          </Field>
          <Field label="Reward type">
            <select
              value={form.type}
              onChange={(e) => set({ type: e.target.value })}
              disabled={editing && reward?.awardedCount > 0}
              className="ds-input w-full"
            >
              {Object.entries(REWARD_TYPE_INFO).map(([id, t]) => (
                <option key={id} value={id}>
                  {t.label}
                </option>
              ))}
            </select>
            {editing && reward?.awardedCount > 0 && (
              <p className="text-[11px] font-medium text-amber-600">The type cannot change after customers have won this reward.</p>
            )}
          </Field>
        </div>

        {info.needsValue && (
          <Field label={info.valueLabel}>
            <input type="number" min="0" value={form.value} onChange={(e) => set({ value: e.target.value })} placeholder={info.suggest} className="ds-input w-full sm:max-w-xs" />
          </Field>
        )}

        {form.type === "free_product" && (
          <EntityPicker
            label="Free product"
            multiple={false}
            value={form.freeProductId}
            onChange={(v) => set({ freeProductId: v })}
            onSearch={searchProducts}
            knownLabels={labels}
            placeholder="Search product by name..."
          />
        )}

        {/* appearance */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Icon on the slice">
            <div className="flex flex-wrap gap-1.5">
              {ICON_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set({ icon: key })}
                  aria-label={`Icon ${key}`}
                  aria-pressed={form.icon === key}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg border-2 text-lg",
                    form.icon === key ? "border-primary bg-brand-50" : "border-slate-100 hover:border-slate-200",
                  )}
                >
                  {iconFor({ icon: key })}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Slice colour" help="Leave on theme to match your brand colour automatically.">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.color || "#0284c7"}
                onChange={(e) => set({ color: e.target.value })}
                className="h-10 w-14 cursor-pointer rounded-lg border border-slate-200"
                aria-label="Slice colour"
              />
              <button
                type="button"
                onClick={() => set({ color: "" })}
                className={cn("rounded-lg px-3 py-2 text-xs font-bold", form.color ? "bg-slate-100 text-slate-600" : "bg-brand-50 text-primary")}
              >
                Use theme colour
              </button>
            </div>
          </Field>
        </div>

        {/* chance */}
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Probability weight" help="Higher = wins more often. 0 means this slice can never be won.">
              <input type="number" min="0" step="any" value={form.weight} onChange={(e) => set({ weight: e.target.value })} className="ds-input w-full" />
            </Field>
            <div className="flex flex-col justify-center rounded-xl bg-white p-3 ring-1 ring-slate-100">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Chance of winning</p>
              <p className="text-2xl font-black text-primary">{probability}%</p>
              <p className="text-[11px] font-medium text-slate-400">Calculated against all active slices.</p>
            </div>
          </div>
        </div>

        {isPrize && (
          <div className="grid gap-4 sm:grid-cols-2">
            {form.type !== "wallet_cashback" && (
              <Field label="Minimum cart value (₹)" help="Reward works only when the eligible items add up to this much.">
                <input type="number" min="0" value={form.minCartValue} onChange={(e) => set({ minCartValue: e.target.value })} placeholder="0" className="ds-input w-full" />
              </Field>
            )}
            {["percentage", "free_delivery", "free_product"].includes(form.type) && (
              <Field label="Maximum discount (₹)" help="Optional cap. Leave empty for no cap.">
                <input type="number" min="0" value={form.maxDiscount} onChange={(e) => set({ maxDiscount: e.target.value })} placeholder="No cap" className="ds-input w-full" />
              </Field>
            )}
            <Field
              label="Total quantity"
              help={
                editing && reward?.awardedCount != null
                  ? `Empty = unlimited. Already won: ${reward.awardedCount}.`
                  : "How many times this can be won in total. Empty = unlimited."
              }
            >
              <input type="number" min="0" value={form.totalQuantity} onChange={(e) => set({ totalQuantity: e.target.value })} placeholder="Unlimited" className="ds-input w-full" />
            </Field>
            <Field label="Max per customer" help="Empty = no limit per customer.">
              <input type="number" min="1" value={form.perCustomerLimit} onChange={(e) => set({ perCustomerLimit: e.target.value })} placeholder="No limit" className="ds-input w-full" />
            </Field>
            {form.type !== "wallet_cashback" && (
              <Field label="Valid for (days)" help="Days to use it after winning. Empty = campaign default.">
                <input type="number" min="1" max="365" value={form.validityDays} onChange={(e) => set({ validityDays: e.target.value })} placeholder="Campaign default" className="ds-input w-full" />
              </Field>
            )}
          </div>
        )}

        {canRestrict && (
          <div className="space-y-4 rounded-2xl border border-slate-100 p-4">
            <div>
              <h4 className="text-sm font-black text-slate-800">Where can it be used?</h4>
              <p className="text-[11px] font-medium text-slate-400">Leave everything empty to allow any product in any store.</p>
            </div>
            <EntityPicker label="Only these categories" options={categories} value={form.eligibleCategoryIds} onChange={(v) => set({ eligibleCategoryIds: v })} placeholder="Search categories..." />
            <EntityPicker label="Only these stores" options={sellers} value={form.eligibleSellerIds} onChange={(v) => set({ eligibleSellerIds: v })} placeholder="Search stores..." />
            <EntityPicker label="Only these products" onSearch={searchProducts} knownLabels={labels} value={form.eligibleProductIds} onChange={(v) => set({ eligibleProductIds: v })} placeholder="Search products..." />
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-slate-700">Active on the wheel</p>
            <p className="text-[11px] font-medium text-slate-400">Funded by the company. Seller payouts are not reduced.</p>
          </div>
          <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="h-5 w-5 accent-[var(--primary)]" aria-label="Active" />
        </div>
      </div>
    </Modal>
  );
};

export default SpinRewardForm;
