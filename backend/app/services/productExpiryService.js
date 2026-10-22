const DAY_MS = 24 * 60 * 60 * 1000;

// A product is expired from 00:00 (store time zone) on its expiry date, so it is never
// sold on the day it expires. Store time zone defaults to India.
const STORE_UTC_OFFSET = () => process.env.STORE_UTC_OFFSET || "+05:30";

export const DEFAULT_EXPIRY_ALERT_DAYS = 7;

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/**
 * Mongo condition that keeps products without an expiry date or whose expiry is still
 * in the future. A single field condition (no $or) so it can be spread next to the
 * approval filter, which already uses $or.
 */
export function notExpiredFilter(now = new Date()) {
  return { expiryDate: { $not: { $lte: now } } };
}

export function expiredFilter(now = new Date()) {
  return { expiryDate: { $lte: now } };
}

// Not expired yet, but inside the product's own alert window (expiryAlertDays)
export function expiringSoonFilter(now = new Date()) {
  return {
    expiryDate: { $gt: now },
    $expr: {
      $lte: [
        "$expiryDate",
        {
          $add: [
            now,
            { $multiply: [{ $ifNull: ["$expiryAlertDays", DEFAULT_EXPIRY_ALERT_DAYS] }, DAY_MS] },
          ],
        },
      ],
    },
  };
}

export function isProductExpired(product, now = new Date()) {
  if (!product?.expiryDate) return false;
  const expiry = new Date(product.expiryDate);
  return !Number.isNaN(expiry.getTime()) && expiry <= now;
}

export function filterOutExpired(products = [], now = new Date()) {
  return Array.isArray(products) ? products.filter((p) => p && !isProductExpired(p, now)) : products;
}

/**
 * "none" (no date) | "fresh" | "expiring" (inside the alert window) | "expired"
 */
export function getExpiryState(product, now = new Date()) {
  if (!product?.expiryDate) return { state: "none", daysLeft: null };
  const expiry = new Date(product.expiryDate);
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / DAY_MS);
  if (expiry <= now) return { state: "expired", daysLeft };
  const alertDays = Number.isFinite(Number(product.expiryAlertDays))
    ? Number(product.expiryAlertDays)
    : DEFAULT_EXPIRY_ALERT_DAYS;
  return { state: daysLeft <= alertDays ? "expiring" : "fresh", daysLeft };
}

/**
 * Accepts "YYYY-MM-DD" (start of that day in store time), a full ISO date, or
 * ""/null/"null" to clear. Returns undefined when the field was not sent.
 */
export function parseExpiryDate(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "" || raw === "null" || raw === "undefined") return null;
  const value = String(raw).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00${STORE_UTC_OFFSET()}`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw httpError(400, "Invalid expiry date");
  }
  return date;
}

export function parseExpiryAlertDays(raw) {
  if (raw === undefined || raw === "") return undefined;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 0 || days > 365) {
    throw httpError(400, "Expiry alert days must be a whole number between 0 and 365");
  }
  return days;
}

/**
 * Normalises expiry fields on an incoming product payload in place.
 * When the date changes, the alert flags are reset so the seller is warned again
 * for the new batch.
 */
export function applyExpiryFields(productData, existingProduct = null) {
  const expiryDate = parseExpiryDate(productData.expiryDate);
  const expiryAlertDays = parseExpiryAlertDays(productData.expiryAlertDays);

  delete productData.expiryAlertSentAt;
  delete productData.expiredAlertSentAt;

  if (expiryDate === undefined) {
    delete productData.expiryDate;
  } else {
    productData.expiryDate = expiryDate;
    const previous = existingProduct?.expiryDate ? new Date(existingProduct.expiryDate).getTime() : null;
    const next = expiryDate ? expiryDate.getTime() : null;
    if (previous !== next) {
      productData.expiryAlertSentAt = null;
      productData.expiredAlertSentAt = null;
    }
  }

  if (expiryAlertDays === undefined) {
    delete productData.expiryAlertDays;
  } else {
    productData.expiryAlertDays = expiryAlertDays;
  }
  return productData;
}
