/**
 * Theme helpers for Spin & Win.
 * Colours come from the app theme CSS variables (--brand-*, set from the admin's
 * primary colour), so the wheel always matches the store branding. An admin can
 * still pick a custom colour per slice.
 */

// Alternating shades of the brand colour: [fill, text colour]
const THEME_SLICES = [
  ["var(--brand-600)", "#ffffff"],
  ["var(--brand-100)", "var(--brand-900)"],
  ["var(--brand-500)", "#ffffff"],
  ["var(--brand-200)", "var(--brand-900)"],
  ["var(--brand-700)", "#ffffff"],
  ["var(--brand-50)", "var(--brand-900)"],
];

const NO_PRIZE_SLICE = ["#e2e8f0", "#475569"];

const hexToRgb = (hex) => {
  const clean = String(hex || "").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-fA-F]{6}/.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};

/** White or dark text, whichever is readable on the given hex colour */
export const readableTextOn = (hex) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#ffffff";
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? "#0f172a" : "#ffffff";
};

export function sliceColors(slice, index) {
  if (slice?.color) return { fill: slice.color, text: readableTextOn(slice.color) };
  if (slice?.type === "no_prize") return { fill: NO_PRIZE_SLICE[0], text: NO_PRIZE_SLICE[1] };
  const [fill, text] = THEME_SLICES[index % THEME_SLICES.length];
  return { fill, text };
}

const ICONS = {
  gift: "🎁",
  percent: "％",
  rupee: "₹",
  truck: "🚚",
  wallet: "👛",
  star: "⭐",
  bag: "🛍️",
  fire: "🔥",
  luck: "🍀",
  heart: "💝",
};

export const ICON_KEYS = Object.keys(ICONS);

const DEFAULT_ICON_BY_TYPE = {
  fixed: "rupee",
  percentage: "percent",
  free_delivery: "truck",
  wallet_cashback: "wallet",
  free_product: "gift",
  no_prize: "luck",
};

export const iconFor = (slice) =>
  ICONS[slice?.icon] && slice?.icon !== "gift"
    ? ICONS[slice.icon]
    : ICONS[DEFAULT_ICON_BY_TYPE[slice?.type]] || ICONS.gift;

export const formatExpiry = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

export const daysLeft = (value) => {
  const ms = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86400000));
};

/** Human readable usage conditions for a reward (used in the result card and My Rewards) */
export function rewardConditions(reward) {
  const lines = [];
  if (reward.minCartValue > 0) lines.push(`Valid on orders of ₹${reward.minCartValue} or more`);
  if (reward.maxDiscount != null) lines.push(`Maximum discount ₹${reward.maxDiscount}`);
  if (reward.restrictedToCategories) lines.push("Valid only on selected categories");
  if (reward.restrictedToProducts) lines.push("Valid only on selected products");
  if (reward.restrictedToSellers) lines.push("Valid only at selected stores");
  if (reward.type === "free_product") lines.push("Add the gift item to your cart to claim it");
  if (reward.type === "wallet_cashback") lines.push("Credited to your wallet instantly");
  if (reward.type !== "wallet_cashback") lines.push("One-time use. Cannot be combined with another reward");
  return lines;
}
