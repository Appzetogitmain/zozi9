/**
 * Pure Spin & Win logic: no database, no HTTP. Everything that decides a winner,
 * a discount amount or whether a configuration is valid lives here so it can be
 * unit-tested in isolation.
 */
import crypto from "node:crypto";

export const REWARD_TYPES = [
  "fixed",
  "percentage",
  "free_delivery",
  "wallet_cashback",
  "free_product",
  "no_prize",
];

/** Reward types that can be redeemed against an order at checkout */
export const CHECKOUT_REWARD_TYPES = ["fixed", "percentage", "free_delivery", "free_product"];

export const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/* ------------------------------------------------------------------ */
/* Random selection                                                    */
/* ------------------------------------------------------------------ */

/** Cryptographically secure float in [0, 1) */
export function secureRandomFloat() {
  return crypto.randomInt(0, 1_000_000_000) / 1_000_000_000;
}

/**
 * Weighted random pick. `candidates` need a numeric `weight`; entries with
 * weight <= 0 can never be picked. Returns null when nothing is pickable.
 * `randomFn` is injectable so tests can be deterministic.
 */
export function weightedPick(candidates = [], randomFn = secureRandomFloat) {
  const pool = candidates.filter((c) => Number(c?.weight) > 0 && Number.isFinite(Number(c.weight)));
  if (pool.length === 0) return null;
  const total = pool.reduce((sum, c) => sum + Number(c.weight), 0);
  let cursor = randomFn() * total;
  for (const candidate of pool) {
    cursor -= Number(candidate.weight);
    if (cursor < 0) return candidate;
  }
  return pool[pool.length - 1]; // floating-point safety net
}

/** Probability (0-100) of every candidate relative to the pool (for admin display) */
export function probabilityMap(rewards = []) {
  const live = rewards.filter((r) => r?.isActive !== false && Number(r?.weight) > 0);
  const total = live.reduce((sum, r) => sum + Number(r.weight), 0);
  const map = {};
  for (const r of rewards) {
    const key = String(r._id ?? r.id);
    const isLive = r?.isActive !== false && Number(r?.weight) > 0;
    map[key] = total > 0 && isLive ? round2((Number(r.weight) / total) * 100) : 0;
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Periods and campaign status                                         */
/* ------------------------------------------------------------------ */

const tzOffsetMs = () =>
  (Number.parseInt(process.env.SPIN_TZ_OFFSET_MINUTES ?? "330", 10) || 0) * 60 * 1000;

const pad = (n) => String(n).padStart(2, "0");

/** Bucket key for participation limits (day boundary follows SPIN_TZ_OFFSET_MINUTES, default IST) */
export function periodKey(period, date = new Date()) {
  if (period === "campaign" || !period) return "all";
  const local = new Date(date.getTime() + tzOffsetMs());
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth() + 1;
  const d = local.getUTCDate();
  if (period === "day") return `${y}-${pad(m)}-${pad(d)}`;
  if (period === "month") return `${y}-${pad(m)}`;
  if (period === "week") {
    // ISO week
    const target = new Date(Date.UTC(y, m - 1, d));
    const dayNum = (target.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
    const week =
      1 +
      Math.round(
        ((target - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
      );
    return `${target.getUTCFullYear()}-W${pad(week)}`;
  }
  return "all";
}

/** When the current period ends (so the UI can say "next spin tomorrow"). null for campaign-long limits. */
export function periodResetsAt(period, date = new Date()) {
  if (period === "campaign" || !period) return null;
  const offset = tzOffsetMs();
  const local = new Date(date.getTime() + offset);
  let nextLocal;
  if (period === "day") {
    nextLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1);
  } else if (period === "month") {
    nextLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1);
  } else {
    const dayNum = (local.getUTCDay() + 6) % 7;
    nextLocal = Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() - dayNum + 7,
    );
  }
  return new Date(nextLocal - offset);
}

/**
 * Stored status + dates -> what the campaign really is right now.
 * "active"/"scheduled" are time driven; draft/paused/completed are manual.
 */
export function effectiveCampaignStatus(campaign, now = new Date()) {
  const status = campaign?.status;
  if (status === "active" || status === "scheduled") {
    const start = campaign.startAt ? new Date(campaign.startAt) : null;
    const end = campaign.endAt ? new Date(campaign.endAt) : null;
    if (end && now > end) return "completed";
    if (start && now < start) return "scheduled";
    return "active";
  }
  return status || "draft";
}

export const rangesOverlap = (aStart, aEnd, bStart, bEnd) =>
  new Date(aStart) <= new Date(bEnd) && new Date(bStart) <= new Date(aEnd);

/* ------------------------------------------------------------------ */
/* Reward discount calculation (authoritative, used at checkout)       */
/* ------------------------------------------------------------------ */

const idSet = (list) => new Set((list || []).map((v) => String(v)));

/** Does a (hydrated) cart line qualify under the reward's product/seller/category rules? */
export function itemMatchesReward(item, reward) {
  const sellers = idSet(reward.eligibleSellerIds);
  const products = idSet(reward.eligibleProductIds);
  const categories = idSet(reward.eligibleCategoryIds);

  if (sellers.size && !sellers.has(String(item.sellerId))) return false;
  if (products.size && !products.has(String(item.productId))) return false;
  if (categories.size) {
    const itemCategories = [item.headerCategoryId, item.categoryId, item.subcategoryId]
      .filter(Boolean)
      .map(String);
    if (!itemCategories.some((id) => categories.has(id))) return false;
  }
  return true;
}

/**
 * Computes the discount a reward gives for a cart. Never trusts client values:
 * `items` must be the server-hydrated lines (server prices) and `deliveryFee`
 * the server-calculated fee.
 *
 * Returns { applicable, discount, freeDelivery, reason }.
 */
export function computeRewardDiscount({ reward, items = [], deliveryFee = 0 }) {
  const fail = (reason) => ({ applicable: false, discount: 0, freeDelivery: false, reason });

  if (!reward || !CHECKOUT_REWARD_TYPES.includes(reward.type)) {
    return fail("This reward cannot be used on an order");
  }

  const eligibleItems = items.filter((item) => itemMatchesReward(item, reward));
  if (eligibleItems.length === 0) {
    return fail("This reward is not valid for the items in your cart");
  }

  const eligibleSubtotal = round2(
    eligibleItems.reduce((sum, i) => sum + Number(i.price || 0) * Number(i.quantity || 0), 0),
  );

  const minCart = Number(reward.minCartValue || 0);
  if (eligibleSubtotal < minCart) {
    return fail(`Add items worth ₹${round2(minCart - eligibleSubtotal)} more to use this reward (minimum ₹${minCart})`);
  }

  let discount = 0;
  let freeDelivery = false;
  const value = Number(reward.value || 0);

  switch (reward.type) {
    case "fixed":
      discount = Math.min(value, eligibleSubtotal);
      break;
    case "percentage":
      discount = (eligibleSubtotal * value) / 100;
      break;
    case "free_delivery":
      discount = Number(deliveryFee || 0);
      freeDelivery = true;
      break;
    case "free_product": {
      const freeLines = items.filter(
        (i) => reward.freeProductId && String(i.productId) === String(reward.freeProductId),
      );
      if (freeLines.length === 0) {
        return fail("Add the free gift product to your cart to use this reward");
      }
      discount = Math.min(...freeLines.map((i) => Number(i.price || 0)));
      break;
    }
    default:
      return fail("Unsupported reward type");
  }

  const cap = reward.maxDiscount == null ? null : Number(reward.maxDiscount);
  if (cap != null && Number.isFinite(cap) && cap >= 0) {
    discount = Math.min(discount, cap);
  }
  discount = round2(Math.max(0, discount));

  if (discount <= 0) {
    return fail(
      reward.type === "free_delivery"
        ? "Delivery is already free on this order"
        : "This reward does not give a discount on the current cart",
    );
  }

  return { applicable: true, discount, freeDelivery, reason: "" };
}

/**
 * Splits `total` across `weights` so the parts always add up to exactly
 * round2(total) (the last non-zero share absorbs rounding drift).
 */
export function allocateProportionally(total, weights = []) {
  const target = round2(total);
  const sum = weights.reduce((s, w) => s + Math.max(0, Number(w) || 0), 0);
  if (weights.length === 0) return [];
  if (sum <= 0) {
    const even = round2(target / weights.length);
    const parts = weights.map(() => even);
    parts[parts.length - 1] = round2(target - even * (weights.length - 1));
    return parts;
  }
  const parts = weights.map((w) => round2((target * Math.max(0, Number(w) || 0)) / sum));
  let lastIdx = -1;
  weights.forEach((w, i) => {
    if (Number(w) > 0) lastIdx = i;
  });
  const drift = round2(target - parts.reduce((s, p) => s + p, 0));
  if (lastIdx >= 0) parts[lastIdx] = round2(parts[lastIdx] + drift);
  return parts;
}

/* ------------------------------------------------------------------ */
/* Codes                                                               */
/* ------------------------------------------------------------------ */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function generateRewardCode(length = 8) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `SPIN-${out}`;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const isNum = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

/** Validates one reward definition. Returns an array of human readable errors. */
export function validateRewardConfig(input = {}) {
  const errors = [];
  const type = input.type;

  if (!REWARD_TYPES.includes(type)) errors.push("Choose a valid reward type");
  if (!String(input.label || "").trim()) errors.push("Label is required");
  if (String(input.label || "").length > 40) errors.push("Label can be at most 40 characters");

  const value = Number(input.value ?? 0);
  if (type === "fixed" && !(value > 0)) errors.push("Fixed discount must be greater than 0");
  if (type === "percentage" && !(value > 0 && value <= 100)) {
    errors.push("Percentage must be between 0 and 100");
  }
  if (type === "wallet_cashback" && !(value > 0)) errors.push("Cashback amount must be greater than 0");
  if (type === "free_product" && !input.freeProductId) errors.push("Select the free product");

  if (!isNum(input.weight) || Number(input.weight) < 0) {
    errors.push("Probability weight must be 0 or more");
  }
  if (isNum(input.minCartValue) && Number(input.minCartValue) < 0) {
    errors.push("Minimum cart value cannot be negative");
  }
  if (input.maxDiscount != null && input.maxDiscount !== "") {
    if (!isNum(input.maxDiscount) || Number(input.maxDiscount) < 0) {
      errors.push("Maximum discount cannot be negative");
    }
  }
  if (input.totalQuantity != null && input.totalQuantity !== "") {
    if (!Number.isInteger(Number(input.totalQuantity)) || Number(input.totalQuantity) < 0) {
      errors.push("Total quantity must be a whole number (or empty for unlimited)");
    }
  }
  if (input.perCustomerLimit != null && input.perCustomerLimit !== "") {
    if (!Number.isInteger(Number(input.perCustomerLimit)) || Number(input.perCustomerLimit) < 1) {
      errors.push("Per-customer limit must be a whole number of at least 1");
    }
  }
  if (input.validityDays != null && input.validityDays !== "") {
    const days = Number(input.validityDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      errors.push("Validity must be between 1 and 365 days");
    }
  }
  return errors;
}

/**
 * Validates a whole wheel before a campaign goes live.
 * - 2 to 12 live slices (readable wheel)
 * - at least one slice can actually be won
 * - the wheel can never run dry: needs a no-prize slice or an unlimited reward
 */
export function validateRewardSet(rewards = []) {
  const errors = [];
  const live = rewards.filter((r) => r.isActive !== false);
  if (live.length < 2) errors.push("Add at least 2 active rewards to the wheel");
  if (live.length > 12) errors.push("A wheel can have at most 12 active rewards");

  const winnable = live.filter((r) => Number(r.weight) > 0);
  if (winnable.length === 0) errors.push("At least one reward needs a probability weight above 0");

  const cannotRunOut = winnable.some(
    (r) => r.type === "no_prize" || r.totalQuantity == null || r.totalQuantity === "",
  );
  if (winnable.length > 0 && !cannotRunOut) {
    errors.push(
      "Add a No-prize slice, or at least one reward with unlimited quantity, so the wheel never runs out",
    );
  }
  return errors;
}

/** Validates campaign fields needed to go live */
export function validateCampaignForActivation(campaign = {}) {
  const errors = [];
  if (!campaign.startAt || !campaign.endAt) errors.push("Set a start and end date");
  else if (new Date(campaign.endAt) <= new Date(campaign.startAt)) {
    errors.push("End date must be after the start date");
  }
  return errors;
}

export default {
  weightedPick,
  computeRewardDiscount,
  allocateProportionally,
  periodKey,
  effectiveCampaignStatus,
  validateRewardConfig,
  validateRewardSet,
};
