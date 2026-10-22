import React, { useEffect, useMemo, useState } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Modal from "@shared/components/ui/Modal";
import { useToast } from "@shared/components/ui/Toast";
import {
  HiOutlinePlus,
  HiOutlineBolt,
  HiOutlineTrash,
  HiOutlinePencilSquare,
  HiOutlinePause,
  HiOutlinePlay,
  HiOutlineStopCircle,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineMagnifyingGlass,
} from "react-icons/hi2";
import { cn } from "@/lib/utils";

/**
 * Flash sale management shared by the admin and seller panels.
 *
 * api: { getFlashSales, createFlashSale, updateFlashSale, setFlashSaleActive,
 *        endFlashSale, deleteFlashSale, reviewFlashSale? (admin only) }
 * loadSellers (admin only): () => Promise<Seller[]>
 * loadProducts: ({ sellerId, search }) => Promise<Product[]>
 */

const STATUS_STYLES = {
  live: { label: "Live", className: "bg-emerald-100 text-emerald-700" },
  scheduled: { label: "Scheduled", className: "bg-sky-100 text-sky-700" },
  pending: { label: "Waiting for approval", className: "bg-amber-100 text-amber-700" },
  rejected: { label: "Rejected", className: "bg-rose-100 text-rose-700" },
  paused: { label: "Paused", className: "bg-slate-200 text-slate-700" },
  ended: { label: "Ended", className: "bg-slate-100 text-slate-500" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Waiting for approval" },
  { key: "live", label: "Live" },
  { key: "scheduled", label: "Scheduled" },
  { key: "ended", label: "Ended" },
];

const inputClass =
  "w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold outline-none ring-1 ring-transparent focus:ring-primary/20";
const labelClass = "text-xs font-black text-slate-500 uppercase tracking-widest";

function toLocalInput(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function formatDateTime(date) {
  return new Date(date).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function extractList(res) {
  const data = res?.data || {};
  const raw = data.result ?? data.results ?? data;
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

function regularPriceOf(product, variant) {
  if (variant) return Number(variant.salePrice || variant.price || product?.salePrice || product?.price || 0);
  return Number(product?.salePrice || product?.price || 0);
}

function emptyForm() {
  const start = new Date(Date.now() + 10 * 60000);
  const end = new Date(start.getTime() + 2 * 60 * 60000);
  return {
    title: "",
    description: "",
    startAt: toLocalInput(start),
    endAt: toLocalInput(end),
    items: [],
  };
}

const FlashSaleManager = ({ mode, api, loadSellers, loadProducts }) => {
  const isAdmin = mode === "admin";
  const { showToast } = useToast();

  const [sales, setSales] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  const [sellers, setSellers] = useState([]);
  const [pickerSellerId, setPickerSellerId] = useState("");
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  const loadSales = async () => {
    setIsLoading(true);
    try {
      const res = await api.getFlashSales();
      setSales(extractList(res));
    } catch (e) {
      console.error(e);
      showToast("Failed to load flash sales", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
    if (isAdmin && loadSellers) {
      loadSellers()
        .then((list) => setSellers(Array.isArray(list) ? list : []))
        .catch(() => showToast("Failed to load sellers", "error"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Product search for the picker (debounced)
  useEffect(() => {
    if (!isModalOpen) return;
    if (isAdmin && !pickerSellerId) {
      setProducts([]);
      return;
    }
    const id = setTimeout(async () => {
      setIsLoadingProducts(true);
      try {
        const list = await loadProducts({ sellerId: pickerSellerId, search: search.trim() });
        setProducts(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error(e);
        setProducts([]);
        showToast("Failed to load products", "error");
      } finally {
        setIsLoadingProducts(false);
      }
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen, pickerSellerId, search]);

  const counts = useMemo(() => {
    const c = { all: sales.length };
    sales.forEach((s) => {
      c[s.status] = (c[s.status] || 0) + 1;
    });
    return c;
  }, [sales]);

  const visibleSales = useMemo(
    () => (filter === "all" ? sales : sales.filter((s) => s.status === filter)),
    [sales, filter],
  );

  const replaceSale = (updated) => {
    setSales((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
  };

  /* ---------- modal ---------- */

  const openCreateModal = () => {
    setEditingSale(null);
    setFormData(emptyForm());
    setPickerSellerId("");
    setSearch("");
    setIsModalOpen(true);
  };

  const openEditModal = (sale) => {
    setEditingSale(sale);
    setFormData({
      title: sale.title || "",
      description: sale.description || "",
      startAt: toLocalInput(sale.startAt),
      endAt: toLocalInput(sale.endAt),
      items: (sale.items || []).map((item) => {
        const product = item.product || {};
        const variant = (product.variants || []).find((v) => String(v?.sku || "").trim() === item.variantSku);
        return {
          key: `${product._id}::${item.variantSku}`,
          productId: product._id,
          productName: product.name || "Deleted product",
          image: product.mainImage,
          variantSku: item.variantSku,
          variantName: item.variantName,
          regularPrice: regularPriceOf(product, variant),
          flashPrice: item.flashPrice,
          totalQuantity: item.totalQuantity,
          perCustomerLimit: item.perCustomerLimit,
          soldQuantity: item.soldQuantity || 0,
        };
      }),
    });
    // A seller's sale can only contain that seller's products
    const ownerSellerId = sale.sellerId?._id || sale.sellerId || sale.items?.[0]?.sellerId?._id || "";
    setPickerSellerId(isAdmin ? String(ownerSellerId || "") : "");
    setSearch("");
    setIsModalOpen(true);
  };

  const addItem = (product, variant) => {
    const variantSku = variant ? String(variant.sku || "").trim() : "";
    const key = `${product._id}::${variantSku}`;
    if (formData.items.some((i) => i.key === key)) {
      showToast("Already added", "warning");
      return;
    }
    const regularPrice = regularPriceOf(product, variant);
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          key,
          productId: product._id,
          productName: product.name,
          image: product.mainImage,
          variantSku,
          variantName: variant ? String(variant.name || "").trim() : "",
          regularPrice,
          flashPrice: Math.max(1, Math.floor(regularPrice * 0.8)),
          totalQuantity: Math.max(1, Math.min(50, Number(variant?.stock ?? product.stock ?? 50) || 50)),
          perCustomerLimit: 2,
          soldQuantity: 0,
        },
      ],
    }));
  };

  const updateItem = (key, field, value) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.key === key ? { ...i, [field]: value } : i)),
    }));
  };

  const removeItem = (key) => {
    setFormData((prev) => ({ ...prev, items: prev.items.filter((i) => i.key !== key) }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return showToast("Title is required", "warning");
    if (!formData.startAt || !formData.endAt) return showToast("Pick start and end time", "warning");
    if (formData.items.length === 0) return showToast("Add at least one product", "warning");
    const badPrice = formData.items.find(
      (i) => !(Number(i.flashPrice) > 0) || Number(i.flashPrice) >= Number(i.regularPrice),
    );
    if (badPrice) {
      return showToast(`Flash price of ${badPrice.productName} must be lower than ₹${badPrice.regularPrice}`, "warning");
    }

    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      startAt: new Date(formData.startAt).toISOString(),
      endAt: new Date(formData.endAt).toISOString(),
      items: formData.items.map((i) => ({
        product: i.productId,
        variantSku: i.variantSku,
        flashPrice: Number(i.flashPrice),
        totalQuantity: Number(i.totalQuantity),
        perCustomerLimit: Number(i.perCustomerLimit || 0),
      })),
    };

    setIsSaving(true);
    try {
      const res = editingSale
        ? await api.updateFlashSale(editingSale._id, payload)
        : await api.createFlashSale(payload);
      const saved = res.data.result;
      if (editingSale) replaceSale(saved);
      else setSales((prev) => [saved, ...prev]);
      showToast(res.data.message || "Saved", "success");
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.message || "Failed to save flash sale", "error");
    } finally {
      setIsSaving(false);
    }
  };

  /* ---------- row actions ---------- */

  const runAction = async (fn, successFallback) => {
    try {
      const res = await fn();
      if (res?.data?.result?._id) replaceSale(res.data.result);
      showToast(res?.data?.message || successFallback, "success");
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.message || "Action failed", "error");
    }
  };

  const handleReject = (sale) => {
    const reason = window.prompt("Reason for rejecting (shown to the seller):", "");
    if (reason === null) return;
    runAction(() => api.reviewFlashSale(sale._id, "reject", reason), "Rejected");
  };

  const handleEnd = (sale) => {
    if (!window.confirm(`End "${sale.title}" now? Prices go back to normal immediately.`)) return;
    runAction(() => api.endFlashSale(sale._id), "Ended");
  };

  const handleDelete = async (sale) => {
    if (!window.confirm(`Delete "${sale.title}"?`)) return;
    try {
      await api.deleteFlashSale(sale._id);
      setSales((prev) => prev.filter((s) => s._id !== sale._id));
      showToast("Flash sale deleted", "success");
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to delete", "error");
    }
  };

  const canEdit = (sale) => isAdmin || !["live", "ended"].includes(sale.status);

  /* ---------- render ---------- */

  return (
    <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1 mb-6">
        <div>
          <h1 className="ds-h1 flex items-center gap-3">
            Flash Sales
            <Badge variant="primary" className="text-xs font-black uppercase tracking-widest">
              Limited time deals
            </Badge>
          </h1>
          <p className="ds-description mt-1">
            {isAdmin
              ? "Run time-limited deals on any seller's products. Sales created by sellers appear here for approval. The seller's payout is calculated on the flash price."
              : "Offer some of your products at a special price for a limited time. Every new or edited sale is reviewed by the admin before it goes live. Your payout is calculated on the flash price."}
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-6 py-3.5 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-xl hover:scale-[1.02] active:scale-95 transition-all self-start lg:self-auto">
          <HiOutlinePlus className="h-5 w-5" />
          New Flash Sale
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 px-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-bold border transition-all",
              filter === f.key
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
            )}>
            {f.label}
            {counts[f.key] ? <span className="ml-1.5 opacity-70">{counts[f.key]}</span> : null}
          </button>
        ))}
      </div>

      <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-50 flex items-center justify-between">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">
            Sales ({visibleSales.length})
          </h2>
          {isLoading && <span className="text-xs font-bold text-slate-500">Loading...</span>}
        </div>

        <div className="divide-y divide-slate-50">
          {visibleSales.map((sale) => {
            const style = STATUS_STYLES[sale.status] || STATUS_STYLES.ended;
            const soldPct = sale.totalUnits ? Math.round((sale.soldUnits / sale.totalUnits) * 100) : 0;
            const owner = sale.sellerId?.shopName || (sale.createdByRole === "admin" ? "Admin" : "Seller");
            return (
              <div key={sale._id} className="px-4 py-4 flex flex-col gap-3 hover:bg-slate-50/40 transition-colors">
                <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center flex-shrink-0">
                    <HiOutlineBolt className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-black text-slate-900">{sale.title}</p>
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider", style.className)}>
                        {style.label}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-500 mt-0.5">
                      {formatDateTime(sale.startAt)} → {formatDateTime(sale.endAt)}
                      {isAdmin && <> · by {owner}</>} · {sale.items?.length || 0} product(s)
                    </p>
                    {sale.status === "rejected" && sale.rejectionReason && (
                      <p className="text-xs font-bold text-rose-600 mt-1">Reason: {sale.rejectionReason}</p>
                    )}
                    <div className="mt-2 flex items-center gap-2 max-w-xs">
                      <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 rounded-full" style={{ width: `${soldPct}%` }} />
                      </div>
                      <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">
                        {sale.soldUnits}/{sale.totalUnits} sold
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    {isAdmin && sale.status === "pending" && (
                      <>
                        <button
                          onClick={() => runAction(() => api.reviewFlashSale(sale._id, "approve"), "Approved")}
                          className="flex items-center gap-1 px-3 py-2 text-xs font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl">
                          <HiOutlineCheckCircle className="h-4 w-4" /> Approve
                        </button>
                        <button
                          onClick={() => handleReject(sale)}
                          className="flex items-center gap-1 px-3 py-2 text-xs font-black text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl">
                          <HiOutlineXCircle className="h-4 w-4" /> Reject
                        </button>
                      </>
                    )}
                    {["live", "scheduled", "paused"].includes(sale.status) && (
                      <button
                        title={sale.isActive ? "Pause" : "Resume"}
                        onClick={() =>
                          runAction(() => api.setFlashSaleActive(sale._id, !sale.isActive), sale.isActive ? "Paused" : "Resumed")
                        }
                        className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl">
                        {sale.isActive ? <HiOutlinePause className="h-5 w-5" /> : <HiOutlinePlay className="h-5 w-5" />}
                      </button>
                    )}
                    {sale.status !== "ended" && (
                      <button
                        title="End now"
                        onClick={() => handleEnd(sale)}
                        className="p-2 text-slate-500 hover:text-orange-700 hover:bg-orange-50 rounded-xl">
                        <HiOutlineStopCircle className="h-5 w-5" />
                      </button>
                    )}
                    {canEdit(sale) && (
                      <button
                        title="Edit"
                        onClick={() => openEditModal(sale)}
                        className="p-2 text-slate-500 hover:text-primary hover:bg-primary/5 rounded-xl">
                        <HiOutlinePencilSquare className="h-5 w-5" />
                      </button>
                    )}
                    {!sale.soldUnits && (
                      <button
                        title="Delete"
                        onClick={() => handleDelete(sale)}
                        className="p-2 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl">
                        <HiOutlineTrash className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 overflow-x-auto no-scrollbar md:pl-16">
                  {(sale.items || []).map((item) => (
                    <div
                      key={item._id}
                      className="flex items-center gap-2 bg-slate-50 rounded-xl px-2 py-1.5 flex-shrink-0">
                      {item.product?.mainImage && (
                        <img src={item.product.mainImage} alt="" className="h-8 w-8 rounded-lg object-cover" />
                      )}
                      <div className="text-[11px] leading-tight">
                        <p className="font-bold text-slate-800 max-w-[140px] truncate">
                          {item.product?.name || "Deleted product"}
                          {item.variantName && item.variantName !== "Default" ? ` · ${item.variantName}` : ""}
                        </p>
                        <p className="font-bold text-orange-600">
                          ₹{item.flashPrice}{" "}
                          <span className="text-slate-400 font-semibold">
                            · {item.soldQuantity}/{item.totalQuantity}
                          </span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {visibleSales.length === 0 && !isLoading && (
            <div className="p-16 text-center">
              <HiOutlineBolt className="h-12 w-12 text-slate-200 mx-auto mb-3" />
              <h3 className="text-lg font-black text-slate-900">No flash sales here</h3>
              <p className="text-sm font-bold text-slate-500 mt-2">
                Click &quot;New Flash Sale&quot;, pick products, set the flash price and how many units to sell.
              </p>
            </div>
          )}
        </div>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        size="xl"
        title={editingSale ? "Edit Flash Sale" : "New Flash Sale"}>
        <form onSubmit={handleSave} className="space-y-6">
          {!isAdmin && editingSale?.approvalStatus === "approved" && (
            <p className="text-xs font-bold text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
              Saving changes sends this sale back to the admin for approval.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <label className={labelClass}>Sale title</label>
              <input
                value={formData.title}
                onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                placeholder="E.g. Evening Snack Rush"
                className={inputClass}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className={labelClass}>Short description (optional)</label>
              <input
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                placeholder="E.g. Up to 50% off, only till 8 PM"
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Starts</label>
              <input
                type="datetime-local"
                value={formData.startAt}
                onChange={(e) => setFormData((p) => ({ ...p, startAt: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Ends</label>
              <input
                type="datetime-local"
                value={formData.endAt}
                onChange={(e) => setFormData((p) => ({ ...p, endAt: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>

          {/* Product picker */}
          <div className="space-y-2">
            <label className={labelClass}>Add products</label>
            <div className="flex flex-col md:flex-row gap-2">
              {isAdmin && (
                <select
                  value={pickerSellerId}
                  disabled={Boolean(editingSale?.sellerId)}
                  onChange={(e) => setPickerSellerId(e.target.value)}
                  className={cn(inputClass, "md:w-64")}>
                  <option value="">Choose a seller…</option>
                  {sellers.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.shopName || s.name || s.email}
                    </option>
                  ))}
                </select>
              )}
              <div className="relative flex-1">
                <HiOutlineMagnifyingGlass className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products by name"
                  className={cn(inputClass, "pl-9")}
                />
              </div>
            </div>
            <div className="border border-slate-100 rounded-xl bg-slate-50/50 max-h-56 overflow-y-auto divide-y divide-slate-100">
              {isAdmin && !pickerSellerId ? (
                <p className="text-xs text-slate-500 p-3">Choose a seller to see their products.</p>
              ) : isLoadingProducts ? (
                <p className="text-xs text-slate-500 p-3">Loading products…</p>
              ) : products.length === 0 ? (
                <p className="text-xs text-slate-500 p-3">No products found.</p>
              ) : (
                products.map((product) => {
                  const variants = Array.isArray(product.variants) && product.variants.length ? product.variants : [null];
                  return (
                    <div key={product._id} className="flex items-center gap-3 p-2">
                      {product.mainImage && (
                        <img src={product.mainImage} alt="" className="h-9 w-9 rounded-lg object-cover flex-shrink-0" />
                      )}
                      <p className="text-xs font-bold text-slate-800 flex-1 min-w-0 truncate">{product.name}</p>
                      <div className="flex flex-wrap justify-end gap-1">
                        {variants.map((variant) => {
                          const sku = variant ? String(variant.sku || "").trim() : "";
                          const added = formData.items.some((i) => i.key === `${product._id}::${sku}`);
                          return (
                            <button
                              key={sku || "base"}
                              type="button"
                              disabled={added}
                              onClick={() => addItem(product, variant)}
                              className={cn(
                                "px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all",
                                added
                                  ? "bg-primary text-white border-primary"
                                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100",
                              )}>
                              {added ? "✓ " : "+ "}
                              {variant?.name && variant.name !== "Default" ? `${variant.name} · ` : ""}₹
                              {regularPriceOf(product, variant)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Selected items */}
          <div className="space-y-2">
            <label className={labelClass}>Products in this sale ({formData.items.length})</label>
            {formData.items.length === 0 ? (
              <p className="text-xs text-slate-500">Nothing added yet.</p>
            ) : (
              <div className="space-y-2">
                {formData.items.map((item) => {
                  const off =
                    item.regularPrice > 0 && Number(item.flashPrice) > 0
                      ? Math.round(((item.regularPrice - Number(item.flashPrice)) / item.regularPrice) * 100)
                      : 0;
                  return (
                    <div key={item.key} className="border border-slate-100 rounded-2xl p-3 bg-white">
                      <div className="flex items-center gap-3 mb-3">
                        {item.image && <img src={item.image} alt="" className="h-9 w-9 rounded-lg object-cover" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-slate-800 truncate">
                            {item.productName}
                            {item.variantName && item.variantName !== "Default" ? ` · ${item.variantName}` : ""}
                          </p>
                          <p className="text-[11px] font-bold text-slate-500">
                            Current price ₹{item.regularPrice}
                            {item.soldQuantity > 0 && <> · {item.soldQuantity} already sold</>}
                          </p>
                        </div>
                        {off > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-black">
                            {off}% OFF
                          </span>
                        )}
                        {item.soldQuantity === 0 && (
                          <button
                            type="button"
                            onClick={() => removeItem(item.key)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg">
                            <HiOutlineTrash className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-slate-500 uppercase">Flash price ₹</span>
                          <input
                            type="number"
                            min={1}
                            step="0.01"
                            value={item.flashPrice}
                            onChange={(e) => updateItem(item.key, "flashPrice", e.target.value)}
                            className={cn(inputClass, "px-3 py-2")}
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-slate-500 uppercase">Units for sale</span>
                          <input
                            type="number"
                            min={Math.max(1, item.soldQuantity)}
                            value={item.totalQuantity}
                            onChange={(e) => updateItem(item.key, "totalQuantity", e.target.value)}
                            className={cn(inputClass, "px-3 py-2")}
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-slate-500 uppercase">Max / customer</span>
                          <input
                            type="number"
                            min={0}
                            value={item.perCustomerLimit}
                            onChange={(e) => updateItem(item.key, "perCustomerLimit", e.target.value)}
                            className={cn(inputClass, "px-3 py-2")}
                            title="0 = no limit"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <p className="text-[11px] font-bold text-slate-400">
                  Units above a customer's limit (or after the sale units run out) are charged at the normal price.
                  Max / customer 0 = no limit.
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-4 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl text-xs font-black uppercase tracking-widest">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-4 bg-primary text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20 disabled:opacity-60">
              {isSaving
                ? "Saving…"
                : editingSale
                  ? "Save changes"
                  : isAdmin
                    ? "Create sale"
                    : "Submit for approval"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default FlashSaleManager;
