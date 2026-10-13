import React from "react";
import { HiOutlineInformationCircle } from "react-icons/hi2";
import { cn } from "@/lib/utils";

/**
 * Single source of truth for the image sizes the customer app displays well.
 * width/height are the recommended upload size in px (ratio is what matters;
 * larger uploads with the same ratio are fine).
 */
export const IMAGE_SPECS = {
  banner: {
    label: "Banner",
    width: 1200,
    height: 550,
    ratioLabel: "2.2 : 1 (wide)",
    format: "JPG or WebP",
    maxKB: 300,
    tip: "Shown full-width and cropped to fill. Keep text and logos in the centre 80% so nothing is cut on small phones.",
  },
  product: {
    label: "Product photo",
    width: 1000,
    height: 1000,
    ratioLabel: "1 : 1 (square)",
    format: "WebP, JPG or PNG",
    maxKB: 500,
    tip: "Shown as a square card. Use a clean white or transparent background with the product centred and filling ~80% of the frame.",
  },
  category: {
    label: "Category image",
    width: 300,
    height: 300,
    ratioLabel: "1 : 1 (square)",
    format: "PNG or WebP (transparent)",
    maxKB: 150,
    tip: "Shown as a small square tile. Use a simple, centred picture with some padding around it.",
  },
  notification: {
    label: "Notification image",
    width: 1024,
    height: 512,
    ratioLabel: "2 : 1 (wide)",
    format: "JPG or PNG",
    maxKB: 1024,
    tip: "Shown as a wide preview under the message. Keep the key part in the centre.",
  },
  logo: {
    label: "App logo",
    width: 512,
    height: 512,
    ratioLabel: "square or wide, max 3 : 1",
    format: "PNG or SVG (transparent)",
    maxKB: 200,
    tip: "Shown on a plain background at small size. Use a transparent background and crop away empty space around the logo.",
  },
  favicon: {
    label: "Favicon",
    width: 512,
    height: 512,
    ratioLabel: "1 : 1 (square)",
    format: "PNG (or ICO)",
    maxKB: 100,
    tip: "Shown in the browser tab at 16-32px. Use a bold, simple mark with no small text.",
  },
  video: {
    label: "Product video",
    width: 1080,
    height: 1080,
    ratioLabel: "1 : 1 or 16 : 9",
    format: "MP4 (H.264)",
    maxKB: 51200,
    tip: "Keep it short (under 30 seconds) so it loads quickly on mobile data.",
  },
};

const formatSize = (kb) => (kb >= 1024 ? `${Math.round(kb / 1024)}MB` : `${kb}KB`);

/**
 * Small helper box that tells the uploader which size shows best in the app.
 * `compact` renders a single line (for tight spaces such as table rows).
 */
const ImageSpecHint = ({ type, compact = false, className }) => {
  const spec = IMAGE_SPECS[type];
  if (!spec) return null;

  if (compact) {
    return (
      <p className={cn("text-[11px] leading-snug text-slate-500 font-medium", className)}>
        Best size: <span className="font-bold text-slate-700">{spec.width}×{spec.height}px</span> ({spec.ratioLabel}) · {spec.format} · max {formatSize(spec.maxKB)}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2.5 text-slate-600",
        className,
      )}
    >
      <HiOutlineInformationCircle className="h-4 w-4 mt-0.5 shrink-0 text-sky-500" />
      <div className="space-y-0.5 text-xs leading-relaxed">
        <p className="font-bold text-slate-800">
          Recommended: {spec.width} × {spec.height}px · {spec.ratioLabel}
        </p>
        <p>
          {spec.format} · max {formatSize(spec.maxKB)}
        </p>
        <p className="text-slate-500">{spec.tip}</p>
      </div>
    </div>
  );
};

/**
 * Reads an image file and returns a short warning when it will look poor in
 * the app (wrong shape, too small, too heavy), or null when it is fine.
 * It never blocks the upload - callers just show the message.
 */
export const checkImageSpec = (file, type) =>
  new Promise((resolve) => {
    const spec = IMAGE_SPECS[type];
    if (!spec || !file || !String(file.type || "").startsWith("image/")) {
      resolve(null);
      return;
    }

    const warnings = [];
    if (file.size > spec.maxKB * 1024 * 1.5) {
      warnings.push(`file is ${(file.size / 1024 / 1024).toFixed(1)}MB (aim for under ${formatSize(spec.maxKB)})`);
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      const wanted = spec.width / spec.height;
      const actual = w / h;
      const isLogo = type === "logo";
      const ratioOff = isLogo
        ? actual > 3.2 || actual < 0.5
        : Math.abs(actual - wanted) / wanted > 0.25;

      if (ratioOff) {
        warnings.push(
          `shape is ${w}×${h}, it will be cropped. Best is ${spec.width}×${spec.height} (${spec.ratioLabel})`,
        );
      }
      if (w < spec.width * 0.5 || h < spec.height * 0.5) {
        warnings.push(`${w}×${h} is small and may look blurry (best ${spec.width}×${spec.height})`);
      }
      resolve(warnings.length ? `${spec.label}: ${warnings.join("; ")}.` : null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });

export default ImageSpecHint;
