/**
 * Shop opening / closing.
 *
 * A shop is open when:
 *  - a manual switch ("open" / "closed") is active, it decides; otherwise
 *  - weekly hours are enabled, the current India time must fall in today's window
 *    (a window may run past midnight, e.g. 18:00-02:00); otherwise
 *  - the shop is open round the clock.
 *
 * All times are India Standard Time. IST has no daylight saving, so a fixed
 * offset is exact.
 */
import mongoose from "mongoose";
import Seller from "../models/seller.js";

const IST_OFFSET_MIN = 330;
const MIN_MS = 60 * 1000;
const DAY_MIN = 24 * 60;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export class ShopClosedError extends Error {
  constructor(message, shops = []) {
    super(message);
    this.statusCode = 409;
    this.code = "SHOP_CLOSED";
    this.shops = shops;
  }
}

export function parseHM(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** India-time calendar info for an instant */
function toLocal(date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MIN * MIN_MS);
  return {
    day: shifted.getUTCDay(),
    midnightMs:
      Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - IST_OFFSET_MIN * MIN_MS,
  };
}

/** Open windows [start, end) in ms from yesterday to a week ahead, overlapping ones merged */
function scheduleWindows(weeklyHours = [], now) {
  const byDay = new Map(weeklyHours.map((d) => [Number(d.day), d]));
  const { day: today, midnightMs } = toLocal(now);
  const windows = [];

  for (let k = -1; k <= 7; k += 1) {
    const entry = byDay.get((today + k + 7) % 7);
    if (!entry?.isOpen) continue;
    const open = parseHM(entry.open);
    const close = parseHM(entry.close);
    if (open == null || close == null) continue;

    const dayStart = midnightMs + k * DAY_MIN * MIN_MS;
    const start = dayStart + open * MIN_MS;
    // same open and close time = open all day; earlier close = runs past midnight
    const lengthMin = close === open ? DAY_MIN : (close - open + DAY_MIN) % DAY_MIN;
    windows.push({ start, end: start + lengthMin * MIN_MS });
  }

  windows.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else merged.push({ ...w });
  }
  return merged;
}

function scheduleState(weeklyHours, now) {
  const t = now.getTime();
  const windows = scheduleWindows(weeklyHours, now);
  const current = windows.find((w) => w.start <= t && t < w.end);
  if (current) return { isOpen: true, closesAt: new Date(current.end), opensAt: null };
  const next = windows.find((w) => w.start > t);
  return { isOpen: false, closesAt: null, opensAt: next ? new Date(next.start) : null };
}

/** "9:00 AM", "today at", "tomorrow at", "Mon at" — in India time */
function formatWhen(date, now) {
  const time = new Date(date.getTime() + IST_OFFSET_MIN * MIN_MS);
  let h = time.getUTCHours();
  const m = String(time.getUTCMinutes()).padStart(2, "0");
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const clock = `${h}:${m} ${suffix}`;

  const dayDiff = Math.round((toLocal(date).midnightMs - toLocal(now).midnightMs) / (DAY_MIN * MIN_MS));
  if (dayDiff === 0) return clock;
  if (dayDiff === 1) return `tomorrow ${clock}`;
  return `${DAY_NAMES[time.getUTCDay()]} ${clock}`;
}

/**
 * { isOpen, mode: "manual" | "schedule" | "always", opensAt, closesAt, note, label }
 * opensAt / closesAt are null when unknown (e.g. closed until the seller reopens).
 */
export function computeShopStatus(seller, now = new Date()) {
  const timing = seller?.shopTiming || {};
  const until = timing.overrideUntil ? new Date(timing.overrideUntil) : null;
  const overrideActive =
    (timing.override === "open" || timing.override === "closed") && (!until || until > now);

  let status;
  if (overrideActive) {
    const isOpen = timing.override === "open";
    status = { isOpen, mode: "manual", opensAt: isOpen ? null : until, closesAt: isOpen ? until : null };
  } else if (timing.scheduleEnabled) {
    status = { ...scheduleState(timing.weeklyHours || [], now), mode: "schedule" };
  } else {
    status = { isOpen: true, mode: "always", opensAt: null, closesAt: null };
  }

  let label;
  if (status.isOpen) {
    label = status.closesAt ? `Open · Closes ${formatWhen(status.closesAt, now)}` : "Open";
  } else {
    label = status.opensAt ? `Closed · Opens ${formatWhen(status.opensAt, now)}` : "Closed";
  }

  return {
    isOpen: status.isOpen,
    mode: status.mode,
    opensAt: status.opensAt,
    closesAt: status.closesAt,
    note: status.isOpen ? "" : timing.note || "",
    label,
  };
}

/** Map(sellerId -> { shopName, ...status }) */
export async function getShopStatuses(sellerIds = [], { session = null, now = new Date() } = {}) {
  const ids = Array.from(new Set(sellerIds.map(String))).filter((id) => mongoose.isValidObjectId(id));
  const result = new Map();
  if (ids.length === 0) return result;
  const query = Seller.find({ _id: { $in: ids } }).select("shopName shopTiming").lean();
  if (session) query.session(session);
  for (const seller of await query) {
    result.set(String(seller._id), { shopName: seller.shopName || "This shop", ...computeShopStatus(seller, now) });
  }
  return result;
}

/** Throws ShopClosedError (409) when any of the shops is closed right now. */
export async function assertShopsOpen(sellerIds = [], options = {}) {
  const statuses = await getShopStatuses(sellerIds, options);
  const closed = [...statuses.entries()].filter(([, s]) => !s.isOpen);
  if (closed.length === 0) return;

  const [, first] = closed[0];
  const opens = first.opensAt ? ` It opens ${formatWhen(first.opensAt, options.now || new Date())}.` : "";
  throw new ShopClosedError(
    `${first.shopName} is closed right now.${opens} Please try again when the shop is open.`,
    closed.map(([sellerId, s]) => ({ sellerId, shopName: s.shopName, opensAt: s.opensAt })),
  );
}

/* ------------------------------------------------------------------ */
/* Updates (shared by seller and admin)                                */
/* ------------------------------------------------------------------ */

export function normalizeWeeklyHours(weeklyHours = []) {
  const byDay = new Map(weeklyHours.map((d) => [Number(d.day), d]));
  return [0, 1, 2, 3, 4, 5, 6].map((day) => {
    const entry = byDay.get(day) || {};
    return {
      day,
      isOpen: entry.isOpen !== false,
      open: parseHM(entry.open) != null ? entry.open : "09:00",
      close: parseHM(entry.close) != null ? entry.close : "22:00",
    };
  });
}

export function toShopTimingView(seller, now = new Date()) {
  const timing = seller?.shopTiming || {};
  return {
    sellerId: String(seller._id),
    shopName: seller.shopName || "",
    scheduleEnabled: !!timing.scheduleEnabled,
    weeklyHours: normalizeWeeklyHours(timing.weeklyHours || []),
    override: timing.override || "none",
    overrideUntil: timing.overrideUntil || null,
    note: timing.note || "",
    updatedByRole: timing.updatedByRole || "",
    updatedAt: timing.updatedAt || null,
    status: computeShopStatus(seller, now),
  };
}

async function loadSeller(sellerId) {
  const seller = await Seller.findById(sellerId).select("shopName shopTiming").lean();
  if (!seller) {
    const err = new Error("Seller not found");
    err.statusCode = 404;
    throw err;
  }
  // Sellers created before this feature have no shopTiming stored yet
  const timing = seller.shopTiming || {};
  seller.shopTiming = {
    scheduleEnabled: !!timing.scheduleEnabled,
    weeklyHours: normalizeWeeklyHours(timing.weeklyHours || []),
    override: timing.override || "none",
    overrideUntil: timing.overrideUntil || null,
    note: timing.note || "",
    updatedByRole: timing.updatedByRole || "",
    updatedAt: timing.updatedAt || null,
  };
  return seller;
}

async function saveTiming(sellerId, timing) {
  const updated = await Seller.findByIdAndUpdate(
    sellerId,
    { $set: { shopTiming: timing } },
    { new: true, runValidators: true },
  )
    .select("shopTiming")
    .lean();
  return updated?.shopTiming || timing;
}

export async function getShopTiming(sellerId) {
  return toShopTimingView(await loadSeller(sellerId));
}

/** Save weekly hours / schedule switch / closed note */
export async function updateShopHours(sellerId, { scheduleEnabled, weeklyHours, note }, role) {
  const seller = await loadSeller(sellerId);
  const timing = seller.shopTiming || {};
  if (scheduleEnabled !== undefined) timing.scheduleEnabled = !!scheduleEnabled;
  if (weeklyHours !== undefined) timing.weeklyHours = normalizeWeeklyHours(weeklyHours);
  if (note !== undefined) timing.note = String(note || "").trim();
  timing.updatedByRole = role;
  timing.updatedAt = new Date();
  seller.shopTiming = await saveTiming(seller._id, timing);
  return toShopTimingView(seller);
}

/**
 * Manual switch.
 *  - "close": closed until the next scheduled opening (or until reopened when
 *             keepClosed is true / there are no weekly hours)
 *  - "open":  open until the next scheduled closing (or until changed, without hours)
 *  - "auto":  follow the weekly hours again
 */
export async function setShopOpenState(sellerId, { action, keepClosed = false }, role, now = new Date()) {
  const seller = await loadSeller(sellerId);
  const timing = seller.shopTiming || {};
  const t = now.getTime();
  const windows = timing.scheduleEnabled ? scheduleWindows(timing.weeklyHours || [], now) : [];

  if (action === "auto") {
    timing.override = "none";
    timing.overrideUntil = null;
  } else if (action === "close") {
    timing.override = "closed";
    const nextOpen = windows.find((w) => w.start > t);
    timing.overrideUntil = keepClosed || !nextOpen ? null : new Date(nextOpen.start);
  } else if (action === "open") {
    timing.override = "open";
    const nextClose = windows.find((w) => w.end > t);
    timing.overrideUntil = nextClose ? new Date(nextClose.end) : null;
  } else {
    const err = new Error("action must be open, close or auto");
    err.statusCode = 400;
    throw err;
  }

  timing.updatedByRole = role;
  timing.updatedAt = now;
  seller.shopTiming = await saveTiming(seller._id, timing);
  return toShopTimingView(seller, now);
}

export default {
  computeShopStatus,
  getShopStatuses,
  assertShopsOpen,
  getShopTiming,
  updateShopHours,
  setShopOpenState,
  toShopTimingView,
};
