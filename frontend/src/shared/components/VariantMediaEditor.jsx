import React, { useState } from "react";
import { toast } from "sonner";
import { HiOutlinePhoto, HiOutlineTrash, HiOutlineVideoCamera } from "react-icons/hi2";
import { cn } from "@/lib/utils";
import ImageSpecHint, { checkImageSpec } from "@shared/components/ui/ImageSpecHint";

export const MAX_VARIANT_IMAGES = 4;
export const MAX_VIDEO_SIZE_MB = 50;
const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime";

/**
 * Turns stored variants (images: string[], video: string) into editor state
 * (images: [{ src }], video: { src } | null).
 */
export function toEditableVariantMedia(variant = {}) {
  return {
    ...variant,
    images: (variant.images || []).map((src) => (typeof src === "string" ? { src } : src)),
    video: variant.video ? (typeof variant.video === "string" ? { src: variant.video } : variant.video) : null,
  };
}

/**
 * Appends variant JSON + new media files to a product FormData. Files go as
 * `variantImages_<i>` / `variantVideo_<i>`; the JSON keeps only stored URLs.
 */
export function appendVariantMedia(formData, variants = []) {
  const payload = variants.map((variant, idx) => {
    const { images = [], video, ...rest } = variant;
    images.filter((img) => img?.file).forEach((img) => formData.append(`variantImages_${idx}`, img.file));
    if (video?.file) formData.append(`variantVideo_${idx}`, video.file);
    return {
      ...rest,
      images: images.filter((img) => img && !img.file).map((img) => img.src),
      video: video && !video.file ? video.src : "",
    };
  });
  formData.append("variants", JSON.stringify(payload));
}

/**
 * Per-variant photos (max 4) and one video, shared by the admin and seller product forms.
 * onChangeVariant(index, updater) must apply updater(variant) to variants[index].
 */
const VariantMediaEditor = ({ variants = [], onChangeVariant, labelClassName }) => {
  const [selected, setSelected] = useState(0);
  const activeIdx = Math.min(selected, Math.max(0, variants.length - 1));
  const active = variants[activeIdx] || {};
  const activeImages = active.images || [];
  const activeVideo = active.video;

  const addImages = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (picked.length === 0) return;
    const valid = picked.filter((f) => f.type.startsWith("image/"));
    if (valid.length !== picked.length) toast.error("Only image files are allowed here");
    valid.slice(0, 1).forEach((f) => checkImageSpec(f, "product").then((w) => w && toast.warning(w)));
    onChangeVariant(activeIdx, (v) => {
      const current = v.images || [];
      const room = MAX_VARIANT_IMAGES - current.length;
      if (valid.length > room) toast.error(`Maximum ${MAX_VARIANT_IMAGES} images per variant`);
      const added = valid.slice(0, Math.max(0, room)).map((file) => ({ src: URL.createObjectURL(file), file }));
      return { ...v, images: [...current, ...added] };
    });
  };

  const setVideo = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Please select a video file (MP4, WebM or MOV)");
      return;
    }
    if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
      toast.error(`Video must be smaller than ${MAX_VIDEO_SIZE_MB}MB`);
      return;
    }
    onChangeVariant(activeIdx, (v) => ({ ...v, video: { src: URL.createObjectURL(file), file } }));
  };

  if (variants.length === 0) {
    return <p className="text-xs text-slate-500">Add a variant first to upload its photos and video.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className={labelClassName}>Photos &amp; Video for Variant</label>
        <div className="flex flex-wrap gap-2">
          {variants.map((variant, idx) => (
            <button
              key={variant.id || variant._id || idx}
              type="button"
              onClick={() => setSelected(idx)}
              className={cn(
                "px-3 py-2 rounded-lg text-xs font-bold border transition-all",
                idx === activeIdx
                  ? "bg-primary/10 text-primary border-primary"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
              )}>
              {variant.name || `Variant ${idx + 1}`}
              <span className="ml-2 text-[10px] font-semibold opacity-70">
                {(variant.images || []).length}/{MAX_VARIANT_IMAGES} photos{variant.video ? " + video" : ""}
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 font-medium ml-1">
          Each variant has its own {MAX_VARIANT_IMAGES} photos and 1 video. Customers see the video after the photos
          when they open the product.
        </p>
      </div>

      <div className="space-y-3">
        <label className={labelClassName}>Photos (Max {MAX_VARIANT_IMAGES})</label>
        <ImageSpecHint type="product" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: MAX_VARIANT_IMAGES }).map((_, i) => {
            const img = activeImages[i];
            return (
              <div
                key={i}
                className="aspect-square rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center hover:border-primary hover:bg-primary/5 transition-all cursor-pointer overflow-hidden relative">
                {img ? (
                  <>
                    <img src={img.src} alt="" className="w-full h-full object-cover" />
                    {i === 0 && (
                      <span className="absolute top-2 left-2 bg-primary text-white text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded">
                        Cover
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        onChangeVariant(activeIdx, (v) => ({
                          ...v,
                          images: (v.images || []).filter((_, k) => k !== i),
                        }))
                      }
                      className="absolute top-2 right-2 z-20 p-1.5 bg-white/90 rounded-full text-slate-500 hover:text-rose-700 shadow">
                      <HiOutlineTrash className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      onChange={addImages}
                    />
                    <HiOutlinePhoto className="h-8 w-8 text-slate-200" />
                    <p className="text-xs text-slate-600 font-bold mt-2">UPLOAD</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <label className={labelClassName}>Video (Max 1, up to {MAX_VIDEO_SIZE_MB}MB)</label>
        <ImageSpecHint type="video" compact />
        {activeVideo ? (
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden bg-black">
            <video src={activeVideo.src} controls playsInline className="w-full max-h-56" />
            <div className="absolute top-2 right-2 flex gap-1.5">
              <label
                title="Replace video"
                className="p-1.5 bg-white/90 rounded-full text-slate-500 hover:text-primary shadow cursor-pointer">
                <HiOutlineVideoCamera className="h-4 w-4" />
                <input type="file" accept={VIDEO_ACCEPT} className="hidden" onChange={setVideo} />
              </label>
              <button
                type="button"
                title="Remove video"
                onClick={() => onChangeVariant(activeIdx, (v) => ({ ...v, video: null }))}
                className="p-1.5 bg-white/90 rounded-full text-slate-500 hover:text-rose-700 shadow">
                <HiOutlineTrash className="h-4 w-4" />
              </button>
            </div>
            {activeVideo.file && (
              <span className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                New · uploads when you save
              </span>
            )}
          </div>
        ) : (
          <div className="w-full max-w-sm h-28 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center hover:border-primary hover:bg-primary/5 transition-all cursor-pointer relative overflow-hidden">
            <input
              type="file"
              accept={VIDEO_ACCEPT}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
              onChange={setVideo}
            />
            <HiOutlineVideoCamera className="h-8 w-8 text-slate-200" />
            <p className="text-xs text-slate-600 font-bold mt-2">UPLOAD VIDEO</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VariantMediaEditor;
