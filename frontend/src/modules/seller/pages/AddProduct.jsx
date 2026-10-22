import React, { useState, useMemo, useEffect } from "react";
import Button from "@shared/components/ui/Button";
import Badge from "@shared/components/ui/Badge";
import {
  HiOutlineArrowLeft,
  HiOutlineCube,
  HiOutlineTag,
  HiOutlineCurrencyDollar,
  HiOutlineSwatch,
  HiOutlineFolderOpen,
  HiOutlinePhoto,
  HiOutlineScale,
  HiOutlineArrowPath,
  HiOutlineTrash,
  HiOutlinePlus,
  HiOutlineSquaresPlus,
  HiOutlineVideoCamera,
} from "react-icons/hi2";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { sellerApi } from "../services/sellerApi";
import ImageSpecHint, { IMAGE_SPECS, checkImageSpec } from "@shared/components/ui/ImageSpecHint";
import SearchableSelect from "@shared/components/ui/SearchableSelect";
import ExpiryDateFields from "@shared/components/ExpiryDateFields";
import { appendExpiryFields } from "@/shared/utils/productExpiry";


const MAX_VARIANT_IMAGES = 4;
const MAX_VIDEO_SIZE_MB = 50;

const AddProduct = () => {
  const navigate = useNavigate();
  const [modalTab, setModalTab] = useState("general");
  const [isSaving, setIsSaving] = useState(false);

  const makeSku = (name, index = 1) => {
    const prefix =
      String(name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 5) || "item";
    return `${prefix}-${String(index).padStart(3, "0")}`;
  };

  const isAutoSku = (sku, name, index = 1) =>
    String(sku || "").toLowerCase() === makeSku(name, index);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    sku: "",
    description: "",
    price: "",
    salePrice: "",
    stock: "",
    lowStockAlert: 5,
    expiryDate: "",
    expiryAlertDays: 7,
    category: "",
    subcategory: "",
    header: "",
    status: "active",
    tags: "",
    weight: "",
    brand: "",
    mainImage: null,
    galleryImages: [],
    variants: [
      {
        id: Date.now(),
        name: "",
        price: "",
        salePrice: "",
        stock: "",
        sku: "",
      },
    ],
  });

  const [dbCategories, setDbCategories] = useState([]);
  const [isLoadingCats, setIsLoadingCats] = useState(true);

  useEffect(() => {
    setFormData((prev) => {
      if (!prev.name) return prev;

      const nextSku =
        !prev.sku || isAutoSku(prev.sku, prev.name, 1)
          ? makeSku(prev.name, 1)
          : prev.sku;

      const nextVariants = prev.variants.map((variant, idx) => {
        const variantIndex = idx + 1;
        const shouldAuto =
          !variant.sku || isAutoSku(variant.sku, prev.name, variantIndex);
        return shouldAuto
          ? { ...variant, sku: makeSku(prev.name, variantIndex) }
          : variant;
      });

      const changed =
        nextSku !== prev.sku ||
        nextVariants.some((variant, idx) => variant !== prev.variants[idx]);

      return changed ? { ...prev, sku: nextSku, variants: nextVariants } : prev;
    });
  }, [formData.name]);

  React.useEffect(() => {
    const fetchCats = async () => {
      try {
        const res = await sellerApi.getCategoryTree();
        if (res.data.success) {
          setDbCategories(res.data.results || res.data.result || []);
        }
      } catch (error) {
        toast.error("Failed to load categories");
      } finally {
        setIsLoadingCats(false);
      }
    };
    fetchCats();
  }, []);

  const categories = dbCategories;

  const handleSave = async () => {
    // Validate required fields
    if (!formData.name) {
      toast.error("Please fill in the Product Title");
      return;
    }

    // Validate all three category levels are selected
    if (!formData.header || !formData.category || !formData.subcategory) {
      toast.error("Please select all three category levels: Main Group, Specific Category, and Sub-Category");
      return;
    }

    const firstVariant = formData.variants[0] || {};
    if (!firstVariant.price || !firstVariant.stock) {
      toast.error("Main variant must have price and stock");
      return;
    }

    setIsSaving(true);
    try {
      const data = new FormData();

      // Basic fields
      data.append("name", formData.name);
      data.append("slug", formData.slug);
      data.append("sku", formData.sku);
      data.append("description", formData.description);
      data.append("brand", formData.brand);
      data.append("weight", formData.weight);
      data.append("status", formData.status);
      appendExpiryFields(data, formData);

      // Map top-level price/stock from first variant for indexing/listing
      data.append("price", firstVariant.price);
      data.append("salePrice", firstVariant.salePrice || 0);
      data.append("stock", firstVariant.stock);

      // Category IDs
      data.append("headerId", formData.header);
      data.append("categoryId", formData.category);
      data.append("subcategoryId", formData.subcategory);

      // Tags
      data.append("tags", formData.tags);

      // Variants (media is sent as files; the JSON only carries stored URLs)
      const variantsPayload = formData.variants.map((variant, idx) => {
        const { images = [], video, ...rest } = variant;
        images
          .filter((img) => img.file)
          .forEach((img) => data.append(`variantImages_${idx}`, img.file));
        if (video?.file) data.append(`variantVideo_${idx}`, video.file);
        return {
          ...rest,
          images: images.filter((img) => !img.file).map((img) => img.src),
          video: video && !video.file ? video.src : "",
        };
      });
      data.append("variants", JSON.stringify(variantsPayload));

      const response = await sellerApi.createProduct(data);
      const approvalStatus = response?.data?.result?.approvalStatus;
      if (approvalStatus === "pending") {
        toast.success("Product submitted for admin approval");
      } else {
        toast.success(response?.data?.message || "Product saved successfully!");
      }
      navigate("/seller/products");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save product");
    } finally {
      setIsSaving(false);
    }
  };

  const updateVariant = (index, updater) =>
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) => (i === index ? updater(v) : v)),
    }));

  const handleVariantImageUpload = (e, index) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (picked.length === 0) return;
    const valid = picked.filter((f) => f.type.startsWith("image/"));
    if (valid.length !== picked.length) toast.error("Only image files are allowed here");
    valid.slice(0, 1).forEach((f) => checkImageSpec(f, "product").then((w) => w && toast.warning(w)));
    updateVariant(index, (v) => {
      const current = v.images || [];
      const room = MAX_VARIANT_IMAGES - current.length;
      if (valid.length > room) toast.error(`Maximum ${MAX_VARIANT_IMAGES} images per variant`);
      const added = valid
        .slice(0, Math.max(0, room))
        .map((file) => ({ src: URL.createObjectURL(file), file }));
      return { ...v, images: [...current, ...added] };
    });
  };

  const removeVariantImage = (index, imgIndex) =>
    updateVariant(index, (v) => ({
      ...v,
      images: (v.images || []).filter((_, i) => i !== imgIndex),
    }));

  const handleVariantVideoUpload = (e, index) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Please select a video file (MP4 or WebM)");
      return;
    }
    if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
      toast.error(`Video must be smaller than ${MAX_VIDEO_SIZE_MB}MB`);
      return;
    }
    updateVariant(index, (v) => ({
      ...v,
      video: { src: URL.createObjectURL(file), file },
    }));
  };

  const removeVariantVideo = (index) =>
    updateVariant(index, (v) => ({ ...v, video: null }));

  const [mediaVariantIndex, setMediaVariantIndex] = useState(0);
  const activeMediaIndex = Math.min(mediaVariantIndex, formData.variants.length - 1);
  const activeMediaVariant = formData.variants[activeMediaIndex] || {};
  const activeImages = activeMediaVariant.images || [];
  const activeVideo = activeMediaVariant.video;

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <Button
          variant="ghost"
          className="pl-0 hover:bg-transparent hover:text-primary-600"
          onClick={() => navigate(-1)}>
          <HiOutlineArrowLeft className="mr-2 h-5 w-5" />
          Back to Products
        </Button>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="min-w-[140px]">
            {isSaving ? (
              <>
                <HiOutlineArrowPath className="mr-2 h-5 w-5 animate-spin" />
                Publishing...
              </>
            ) : (
              "Save & Publish"
            )}
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-xl overflow-hidden flex flex-col md:flex-row min-h-[600px] border border-slate-100">
        {/* Sidebar Tabs */}
        <div className="md:w-64 bg-slate-50/50 border-r border-slate-100 p-4 space-y-1 overflow-y-auto">
          {[
            { id: "general", label: "General Info", icon: HiOutlineTag },
            { id: "variants", label: "Item Variants", icon: HiOutlineSwatch },
            { id: "category", label: "Groups", icon: HiOutlineFolderOpen },
            { id: "media", label: "Photos", icon: HiOutlinePhoto },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setModalTab(tab.id)}
              className={cn(
                "w-full flex items-center space-x-3 px-4 py-3 rounded-md text-xs font-bold transition-all text-left",
                modalTab === tab.id
                  ? "bg-white text-primary shadow-sm ring-1 ring-slate-100"
                  : "text-slate-600 hover:bg-slate-100",
              )}>
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          ))}

          <div className="pt-8 px-4">
            <div className="p-4 bg-brand-50 rounded-md border border-brand-100">
              <p className="text-xs font-bold text-brand-600 uppercase tracking-widest mb-1">
                Status
              </p>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
                className="w-full bg-transparent border-none text-xs font-bold text-brand-700 outline-none p-0 cursor-pointer focus:ring-0">
                <option value="active">PUBLISHED</option>
                <option value="inactive">DRAFT</option>
              </select>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-5 overflow-y-auto">
          {modalTab === "general" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="space-y-1.5 flex flex-col">
                <label className="text-xs sm:text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                  Product Title
                </label>
                <input
                  value={formData.name}
                  onChange={(e) => {
                    const nextName = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      name: nextName,
                      sku:
                        !prev.sku || isAutoSku(prev.sku, prev.name, 1)
                          ? makeSku(nextName, 1)
                          : prev.sku,
                      variants: prev.variants.map((variant, idx) => {
                        const variantIndex = idx + 1;
                        const shouldAuto =
                          !variant.sku ||
                          isAutoSku(variant.sku, prev.name, variantIndex);
                        return shouldAuto
                          ? { ...variant, sku: makeSku(nextName, variantIndex) }
                          : variant;
                      }),
                    }));
                  }}
                  className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-md text-sm font-semibold outline-none ring-primary/5 focus:ring-2 transition-all"
                  placeholder="e.g. Premium Basmati Rice"
                />
              </div>
              <div className="space-y-1.5 flex flex-col">
                <label className="text-xs sm:text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                  About this item
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  onWheel={(e) => e.stopPropagation()}
                  onTouchMove={(e) => e.stopPropagation()}
                  className="w-full px-4 py-3 bg-slate-100 border-none rounded-2xl text-sm font-semibold min-h-[160px] max-h-[260px] outline-none transition-all focus:ring-2 focus:ring-primary/5 resize-none overflow-y-auto custom-scrollbar"
                  placeholder="Describe the item here..."
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 flex flex-col">
                  <label className="text-xs sm:text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                    Brand Name
                  </label>
                  <input
                    value={formData.brand}
                    onChange={(e) =>
                      setFormData({ ...formData, brand: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-md text-sm font-semibold outline-none ring-primary/5 focus:ring-2 transition-all"
                    placeholder="e.g. Amul"
                  />
                </div>
                <div className="space-y-1.5 flex flex-col">
                  <label className="text-xs sm:text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                    Product Code
                  </label>
                  <input
                    value={formData.sku}
                    onChange={(e) =>
                      setFormData({ ...formData, sku: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-md text-sm font-mono font-bold outline-none ring-primary/5 focus:ring-2 transition-all"
                    placeholder="AUTO-GENERATED"
                  />
                </div>
              </div>
              <ExpiryDateFields
                expiryDate={formData.expiryDate}
                expiryAlertDays={formData.expiryAlertDays}
                onChange={(field, value) => setFormData((prev) => ({ ...prev, [field]: value }))}
                labelClassName="text-xs sm:text-xs font-bold text-slate-600 uppercase tracking-widest ml-1"
                inputClassName="w-full px-4 py-2.5 bg-slate-100 border-none rounded-md text-sm font-semibold outline-none ring-primary/5 focus:ring-2 transition-all"
              />
            </div>
          )}

          {modalTab === "variants" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Product Variants
                  </h4>
                  <p className="text-xs text-slate-600 font-medium">
                    Add different sizes, colors or weights.
                  </p>
                </div>
                <button
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      variants: [
                        ...prev.variants,
                        {
                          id: Date.now(),
                          name: "",
                          price: "",
                          salePrice: "",
                          stock: "",
                          sku: makeSku(prev.name, prev.variants.length + 1),
                        },
                      ],
                    }))
                  }
                  className="flex items-center space-x-2 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-bold hover:bg-primary/20 transition-all">
                  <HiOutlineSquaresPlus className="h-4 w-4" />
                  <span>ADD VARIANT</span>
                </button>
              </div>

              <div className="space-y-3">
                {(formData.variants || []).map((variant, index) => (
                  <div
                    key={variant.id}
                    className="p-4 bg-slate-50 rounded-2xl border border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-4 items-end group relative">
                    <div className="col-span-12 md:col-span-3 space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                        Variant Name
                      </label>
                      <input
                        value={variant.name}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setFormData((prev) => {
                            const newVariants = prev.variants.map((item, idx) => {
                              if (idx !== index) return item;
                              return { ...item, name: nextValue };
                            });
                            return {
                              ...prev,
                              variants: newVariants,
                            };
                          });
                        }}
                        placeholder="e.g. 1kg, 1 pack, 1 liter..."
                        className="w-full px-3 py-2 bg-white ring-1 ring-slate-200 border-none rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                        Price
                      </label>
                      <input
                        type="number"
                        value={variant.price}
                        onChange={(e) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].price = e.target.value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        placeholder="500"
                        className="w-full px-3 py-2 bg-white ring-1 ring-slate-200 border-none rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2 space-y-1">
                      <label className="text-[8px] font-bold text-brand-500 uppercase tracking-widest ml-1">
                        Sale
                      </label>
                      <input
                        type="number"
                        value={variant.salePrice}
                        onChange={(e) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].salePrice = e.target.value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        placeholder="450"
                        className="w-full px-3 py-2 bg-brand-50 ring-1 ring-brand-100 border-none rounded-xl text-xs font-bold text-brand-700 outline-none focus:ring-2 focus:ring-brand-200"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                        Stock
                      </label>
                      <input
                        type="number"
                        value={variant.stock}
                        onChange={(e) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].stock = e.target.value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        placeholder="10"
                        className="w-full px-3 py-2 bg-white ring-1 ring-slate-200 border-none rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <div className="col-span-5 md:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                        Product Code
                      </label>
                      <input
                        value={variant.sku}
                        onChange={(e) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].sku = e.target.value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        placeholder={makeSku(formData.name, index + 1)}
                        className="w-full px-3 py-2 bg-white ring-1 ring-slate-200 border-none rounded-xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end pb-1">
                      <button
                        onClick={() => {
                          if (formData.variants.length > 1) {
                            setFormData((prev) => {
                              const remaining = prev.variants
                                .map((variant, idx) => ({ variant, oldIndex: idx + 1 }))
                                .filter((item) => item.oldIndex !== index + 1)
                                .map((item, newIdx) => {
                                  const shouldAuto =
                                    !item.variant.sku ||
                                    isAutoSku(item.variant.sku, prev.name, item.oldIndex);
                                  return shouldAuto
                                    ? { ...item.variant, sku: makeSku(prev.name, newIdx + 1) }
                                    : item.variant;
                                });
                              return { ...prev, variants: remaining };
                            });
                          }
                        }}
                        className="p-2 text-slate-400 hover:text-rose-700 transition-colors">
                        <HiOutlineTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {modalTab === "category" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 flex flex-col">
                  <label className="text-xs sm:text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                    Main Group <span className="text-rose-700">*</span>
                  </label>
                  <SearchableSelect
                    value={formData.header}
                    onChange={(v) => setFormData({ ...formData, header: v, category: "", subcategory: "" })}
                    options={categories.map((h) => ({ value: h._id || h.id, label: h.name }))}
                    placeholder="Select Main Group"
                    searchPlaceholder="Search main group..."
                  />
                </div>
                <div className="space-y-1.5 flex flex-col">
                  <label className="text-xs sm:text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                    Specific Category <span className="text-rose-700">*</span>
                  </label>
                  <SearchableSelect
                    value={formData.category}
                    onChange={(v) => setFormData({ ...formData, category: v, subcategory: "" })}
                    disabled={!formData.header}
                    options={(categories.find((h) => (h._id || h.id) === formData.header)?.children || []).map((c) => ({ value: c._id || c.id, label: c.name }))}
                    placeholder="Select Category"
                    searchPlaceholder="Search category..."
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5 flex flex-col">
                  <label className="text-xs sm:text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                    Sub-Category <span className="text-rose-700">*</span>
                  </label>
                  <SearchableSelect
                    value={formData.subcategory}
                    onChange={(v) => setFormData({ ...formData, subcategory: v })}
                    disabled={!formData.category}
                    options={(categories.find((h) => (h._id || h.id) === formData.header)?.children?.find((c) => (c._id || c.id) === formData.category)?.children || []).map((sc) => ({ value: sc._id || sc.id, label: sc.name }))}
                    placeholder="Select Sub-Category"
                    searchPlaceholder="Search sub-category..."
                  />
                </div>
              </div>
            </div>
          )}

          {modalTab === "media" && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-300">
              {/* Variant selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                  Photos &amp; Video for Variant
                </label>
                <div className="flex flex-wrap gap-2">
                  {formData.variants.map((variant, idx) => {
                    const count = (variant.images || []).length;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => setMediaVariantIndex(idx)}
                        className={cn(
                          "px-3 py-2 rounded-lg text-xs font-bold border transition-all",
                          idx === activeMediaIndex
                            ? "bg-primary/10 text-primary border-primary"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                        )}>
                        {variant.name || `Variant ${idx + 1}`}
                        <span className="ml-2 text-[10px] font-semibold opacity-70">
                          {count}/{MAX_VARIANT_IMAGES} photos{variant.video ? " + video" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500 font-medium ml-1">
                  Each variant has its own {MAX_VARIANT_IMAGES} photos and 1 video. The first photo
                  of a variant is its cover image.
                </p>
              </div>

              {/* Variant photos */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                  Photos (Max {MAX_VARIANT_IMAGES})
                </label>
                <ImageSpecHint type="product" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Array.from({ length: MAX_VARIANT_IMAGES }).map((_, i) => {
                    const img = activeImages[i];
                    return (
                      <div
                        key={i}
                        className="aspect-square rounded-md border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center group hover:border-primary hover:bg-primary/5 transition-all cursor-pointer relative overflow-hidden">
                        {img ? (
                          <>
                            <img src={img.src} alt="" className="w-full h-full object-cover" />
                            {i === 0 && (
                              <span className="absolute top-1 left-1 bg-primary text-white text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded">
                                Cover
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => removeVariantImage(activeMediaIndex, i)}
                              className="absolute top-1 right-1 z-20 p-1 bg-white/90 rounded-full text-slate-500 hover:text-rose-700 shadow">
                              <HiOutlineTrash className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="absolute inset-0 opacity-0 cursor-pointer z-10"
                              onChange={(e) => handleVariantImageUpload(e, activeMediaIndex)}
                            />
                            {i === 0 ? (
                              <HiOutlinePhoto className="h-8 w-8 text-slate-200 group-hover:text-primary transition-colors" />
                            ) : (
                              <HiOutlinePlus className="h-5 w-5 text-slate-200 group-hover:text-primary transition-colors" />
                            )}
                            <p className="text-[8px] font-bold text-slate-600 mt-1 uppercase tracking-widest group-hover:text-primary">
                              {i === 0 ? "Upload Cover" : "Add"}
                            </p>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Variant video */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                  Video (Max 1, up to {MAX_VIDEO_SIZE_MB}MB)
                </label>
                <ImageSpecHint type="video" compact />
                {activeVideo ? (
                  <div className="relative w-full max-w-sm rounded-lg overflow-hidden bg-black">
                    <video src={activeVideo.src} controls className="w-full max-h-56" />
                    <button
                      type="button"
                      onClick={() => removeVariantVideo(activeMediaIndex)}
                      className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full text-slate-500 hover:text-rose-700 shadow">
                      <HiOutlineTrash className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="w-full max-w-sm h-28 rounded-md border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center group hover:border-primary hover:bg-primary/5 transition-all cursor-pointer relative overflow-hidden">
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      onChange={(e) => handleVariantVideoUpload(e, activeMediaIndex)}
                    />
                    <HiOutlineVideoCamera className="h-8 w-8 text-slate-200 group-hover:text-primary transition-colors" />
                    <p className="text-[8px] font-bold text-slate-600 mt-1 uppercase tracking-widest group-hover:text-primary">
                      Upload Video
                    </p>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-600 font-medium italic text-center pt-4 border-t border-slate-50">
                Quick Tip: Square {IMAGE_SPECS.product.width}x{IMAGE_SPECS.product.height}px WebP photos look sharp on every phone and load fast.
              </p>
            </div>
          )}


        </div>
      </div>
    </div>
  );
};

export default AddProduct;
