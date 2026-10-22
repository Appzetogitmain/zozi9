import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import { useToast } from "@shared/components/ui/Toast";
import {
  HiOutlineCalendarDays,
  HiOutlineExclamationTriangle,
  HiOutlineNoSymbol,
  HiOutlineCheckBadge,
  HiOutlineMagnifyingGlass,
  HiOutlinePencilSquare,
} from "react-icons/hi2";
import { cn } from "@/lib/utils";
import { expiryBadge, formatExpiryDate, toExpiryInput } from "@/shared/utils/productExpiry";

/**
 * Product expiry dashboard shared by the seller panel (own products) and the admin
 * panel (all sellers). api: { getExpiryProducts, updateProductExpiry }.
 */

const BUCKETS = [
  { key: "expired", label: "Expired", hint: "Hidden from customers", icon: HiOutlineNoSymbol, tone: "rose" },
  { key: "expiring", label: "Expiring soon", hint: "Inside the warning window", icon: HiOutlineExclamationTriangle, tone: "amber" },
  { key: "tracked", label: "With expiry date", hint: "All dated products", icon: HiOutlineCheckBadge, tone: "emerald" },
  { key: "none", label: "No expiry date", hint: "Never hidden automatically", icon: HiOutlineCalendarDays, tone: "slate" },
];

const TONES = {
  rose: { active: "ring-rose-400 bg-rose-50", icon: "bg-rose-100 text-rose-600", count: "text-rose-700" },
  amber: { active: "ring-amber-400 bg-amber-50", icon: "bg-amber-100 text-amber-600", count: "text-amber-700" },
  emerald: { active: "ring-emerald-400 bg-emerald-50", icon: "bg-emerald-100 text-emerald-600", count: "text-emerald-700" },
  slate: { active: "ring-slate-400 bg-slate-50", icon: "bg-slate-100 text-slate-500", count: "text-slate-700" },
};

const COUNT_KEY = { expired: "expired", expiring: "expiring", tracked: "tracked", none: "none" };

const inputClass =
  "px-3 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold outline-none ring-1 ring-slate-200 focus:ring-primary/40";

const ExpiryRow = ({ item, isAdmin, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(toExpiryInput(item.expiryDate));
  const [alertDays, setAlertDays] = useState(item.expiryAlertDays ?? 7);
  const [saving, setSaving] = useState(false);
  const badge = expiryBadge(item.expiryState, item.daysLeft);

  useEffect(() => {
    setDate(toExpiryInput(item.expiryDate));
    setAlertDays(item.expiryAlertDays ?? 7);
  }, [item.expiryDate, item.expiryAlertDays]);

  const save = async (nextDate) => {
    setSaving(true);
    const ok = await onSave(item._id, { expiryDate: nextDate, expiryAlertDays: Number(alertDays) });
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    <div className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-3 hover:bg-slate-50/40 transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="h-12 w-12 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0">
          {item.mainImage && (
            <img
              src={item.mainImage}
              alt=""
              className={cn("h-full w-full object-cover", item.expiryState === "expired" && "grayscale opacity-60")}
            />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-900 truncate">{item.name}</p>
          <p className="text-xs font-bold text-slate-500">
            {isAdmin && <>{item.sellerId?.shopName || "Seller"} · </>}
            Stock {Number(item.stock || 0)} · Expiry {formatExpiryDate(item.expiryDate)}
          </p>
        </div>
      </div>

      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          <label className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
            Warn
            <input
              type="number"
              min={0}
              max={365}
              value={alertDays}
              onChange={(e) => setAlertDays(e.target.value)}
              className={cn(inputClass, "w-16")}
            />
            days before
          </label>
          <button
            disabled={saving}
            onClick={() => save(date || null)}
            className="px-3 py-2 bg-primary text-white rounded-xl text-xs font-black disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
          {item.expiryDate && (
            <button
              disabled={saving}
              onClick={() => save(null)}
              className="px-3 py-2 text-xs font-black text-slate-500 hover:text-rose-600">
              Remove date
            </button>
          )}
          <button onClick={() => setEditing(false)} className="px-2 py-2 text-xs font-bold text-slate-400">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className={cn("px-2.5 py-1 rounded-full text-[11px] font-black whitespace-nowrap", badge.className)}>
            {badge.label}
          </span>
          <button
            onClick={() => setEditing(true)}
            title={item.expiryDate ? "Change expiry date" : "Set expiry date"}
            className="flex items-center gap-1 px-3 py-2 text-xs font-black text-slate-600 hover:text-primary hover:bg-primary/5 rounded-xl">
            <HiOutlinePencilSquare className="h-4 w-4" />
            {item.expiryDate ? "Change" : "Set date"}
          </button>
        </div>
      )}
    </div>
  );
};

const ProductExpiryManager = ({ mode, api, loadSellers }) => {
  const isAdmin = mode === "admin";
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const bucket = BUCKETS.some((b) => b.key === searchParams.get("bucket")) ? searchParams.get("bucket") : "expiring";

  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [sellers, setSellers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isAdmin || !loadSellers) return;
    loadSellers()
      .then((list) => setSellers(Array.isArray(list) ? list : []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPage(1);
  }, [bucket, search, sellerId]);

  useEffect(() => {
    const id = setTimeout(async () => {
      setIsLoading(true);
      try {
        const params = { bucket, page, limit: 20 };
        if (search.trim()) params.search = search.trim();
        if (isAdmin && sellerId) params.sellerId = sellerId;
        const res = await api.getExpiryProducts(params);
        const result = res.data?.result || {};
        setItems(Array.isArray(result.items) ? result.items : []);
        setCounts(result.counts || {});
        setTotalPages(result.totalPages || 1);
      } catch (e) {
        console.error(e);
        showToast("Failed to load products", "error");
      } finally {
        setIsLoading(false);
      }
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, page, search, sellerId, reloadKey]);

  const handleSave = async (productId, data) => {
    try {
      const res = await api.updateProductExpiry(productId, data);
      showToast(res.data?.message || "Saved", "success");
      setReloadKey((k) => k + 1); // product may move to another tab; refresh list + counts
      return true;
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to save expiry date", "error");
      return false;
    }
  };

  const activeBucket = BUCKETS.find((b) => b.key === bucket);

  return (
    <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      <div className="px-1 mb-6">
        <h1 className="ds-h1 flex items-center gap-3">
          Product Expiry
          <Badge variant="primary" className="text-xs font-black uppercase tracking-widest">
            Auto-hide
          </Badge>
        </h1>
        <p className="ds-description mt-1">
          Products are hidden from customers automatically on their expiry date, and can't be ordered after that.
          {isAdmin ? " Sellers" : " You"} get a notification before a product expires and again when it expires.
          Set a new date when fresh stock arrives and the product shows up again.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {BUCKETS.map((b) => {
          const tone = TONES[b.tone];
          const Icon = b.icon;
          const isActive = b.key === bucket;
          return (
            <button
              key={b.key}
              onClick={() => setSearchParams({ bucket: b.key })}
              className={cn(
                "text-left p-4 rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm transition-all hover:shadow-md",
                isActive && cn("ring-2", tone.active),
              )}>
              <div className="flex items-center justify-between">
                <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", tone.icon)}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className={cn("text-2xl font-black tabular-nums", tone.count)}>
                  {counts[COUNT_KEY[b.key]] ?? "–"}
                </span>
              </div>
              <p className="mt-2 text-xs font-black text-slate-800 uppercase tracking-wider">{b.label}</p>
              <p className="text-[11px] font-semibold text-slate-400">{b.hint}</p>
            </button>
          );
        })}
      </div>

      <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-50 flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">
            {activeBucket?.label} {isLoading && <span className="normal-case font-bold ml-2">Loading…</span>}
          </h2>
          <div className="flex flex-col sm:flex-row gap-2">
            {isAdmin && (
              <select value={sellerId} onChange={(e) => setSellerId(e.target.value)} className={inputClass}>
                <option value="">All sellers</option>
                {sellers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.shopName || s.name || s.email}
                  </option>
                ))}
              </select>
            )}
            <div className="relative">
              <HiOutlineMagnifyingGlass className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products"
                className={cn(inputClass, "pl-9 w-full sm:w-56")}
              />
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-50">
          {items.map((item) => (
            <ExpiryRow key={item._id} item={item} isAdmin={isAdmin} onSave={handleSave} />
          ))}
          {items.length === 0 && !isLoading && (
            <div className="p-14 text-center">
              <HiOutlineCheckBadge className="h-12 w-12 text-slate-200 mx-auto mb-3" />
              <h3 className="text-base font-black text-slate-900">Nothing here</h3>
              <p className="text-sm font-bold text-slate-500 mt-1">
                {bucket === "expired"
                  ? "No expired products."
                  : bucket === "expiring"
                    ? "No products are about to expire."
                    : "No products match."}
              </p>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-50 flex items-center justify-center gap-3">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-xl text-xs font-black bg-slate-100 disabled:opacity-40">
              Previous
            </button>
            <span className="text-xs font-bold text-slate-500">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-xl text-xs font-black bg-slate-100 disabled:opacity-40">
              Next
            </button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ProductExpiryManager;
