import mongoose from "mongoose";
import FlashSale, { FLASH_SALE_APPROVAL_STATUS } from "../models/flashSale.js";
import Order from "../models/order.js";
import Product from "../models/product.js";

/* ===============================
   Helpers
================================ */

export function flashLineKey(productId, variantSku = "") {
  return `${String(productId)}::${String(variantSku || "").trim()}`;
}

function toObjectIds(values = []) {
  return Array.from(new Set(values.map((v) => String(v || "")).filter(Boolean)))
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// Effective (pre-flash) unit price of a variant, or of the product when it has no variants
export function regularUnitPrice(product, variant = null) {
  if (variant) {
    return Number(variant.salePrice || variant.price || product?.salePrice || product?.price || 0);
  }
  return Number(product?.salePrice || product?.price || 0);
}

export function liveSaleFilter(now = new Date()) {
  return {
    approvalStatus: FLASH_SALE_APPROVAL_STATUS.APPROVED,
    isActive: true,
    startAt: { $lte: now },
    endAt: { $gt: now },
  };
}

export function getSaleStatus(sale, now = new Date()) {
  if (!sale) return "ended";
  if (sale.approvalStatus === FLASH_SALE_APPROVAL_STATUS.PENDING) return "pending";
  if (sale.approvalStatus === FLASH_SALE_APPROVAL_STATUS.REJECTED) return "rejected";
  if (new Date(sale.endAt) <= now) return "ended";
  if (!sale.isActive) return "paused";
  if (new Date(sale.startAt) > now) return "scheduled";
  return "live";
}

/* ===============================
   Live offer lookup
================================ */

/**
 * Returns Map(lineKey -> offer) for every product variant that is in a live flash sale
 * and still has flash units left. When a variant is in more than one live sale the
 * cheapest offer wins.
 */
export async function getActiveFlashOffers(productIds = [], { session = null, now = new Date() } = {}) {
  const ids = toObjectIds(productIds);
  const offers = new Map();
  if (ids.length === 0) return offers;

  const query = FlashSale.find({ ...liveSaleFilter(now), "items.product": { $in: ids } })
    .select("_id title endAt items")
    .lean();
  if (session) query.session(session);
  const sales = await query;

  const wanted = new Set(ids.map(String));
  for (const sale of sales) {
    for (const item of sale.items || []) {
      if (!wanted.has(String(item.product))) continue;
      const remaining = Number(item.totalQuantity || 0) - Number(item.soldQuantity || 0);
      if (remaining <= 0) continue;

      const key = flashLineKey(item.product, item.variantSku);
      const existing = offers.get(key);
      if (existing && existing.flashPrice <= Number(item.flashPrice)) continue;

      offers.set(key, {
        saleId: String(sale._id),
        itemId: String(item._id),
        title: sale.title,
        endAt: sale.endAt,
        variantSku: item.variantSku || "",
        flashPrice: Number(item.flashPrice),
        remaining,
        perCustomerLimit: Number(item.perCustomerLimit || 0),
      });
    }
  }
  return offers;
}

// A cart line without a variant SKU is priced like the product's first variant.
export function resolveOfferForLine(offers, product, variantSku = "") {
  if (!offers || offers.size === 0 || !product) return null;
  const sku = String(variantSku || "").trim();
  const direct = offers.get(flashLineKey(product._id, sku));
  if (direct) return direct;
  if (!sku) {
    const firstSku = String(product?.variants?.[0]?.sku || "").trim();
    if (firstSku) return offers.get(flashLineKey(product._id, firstSku)) || null;
  }
  return null;
}

/* ===============================
   Customer-facing price overlay
================================ */

/**
 * Returns a copy of the product with live flash prices written into the matching
 * variants (and the product-level salePrice when the first variant is on sale).
 * Never mutates the input, which may be a shared cached object.
 */
export function applyFlashPricingToProduct(product, offers) {
  if (!product || !offers || offers.size === 0) return product;

  const variants = Array.isArray(product.variants) ? product.variants : [];
  const flashVariants = [];
  let firstVariantFlashPrice = null;

  const nextVariants = variants.map((variant, index) => {
    const offer = offers.get(flashLineKey(product._id, variant?.sku));
    if (!offer) return variant;
    const regular = regularUnitPrice(product, variant);
    if (!(offer.flashPrice < regular)) return variant;

    flashVariants.push({
      itemId: offer.itemId,
      variantSku: offer.variantSku,
      flashPrice: offer.flashPrice,
      regularPrice: regular,
      remaining: offer.remaining,
      perCustomerLimit: offer.perCustomerLimit,
    });
    if (index === 0) firstVariantFlashPrice = offer.flashPrice;
    return { ...variant, salePrice: offer.flashPrice };
  });

  let productLevelFlashPrice = firstVariantFlashPrice;
  let saleRef = flashVariants.length ? offers.get(flashLineKey(product._id, flashVariants[0].variantSku)) : null;

  if (variants.length === 0) {
    const offer = offers.get(flashLineKey(product._id, ""));
    const regular = regularUnitPrice(product);
    if (offer && offer.flashPrice < regular) {
      productLevelFlashPrice = offer.flashPrice;
      saleRef = offer;
      flashVariants.push({
        itemId: offer.itemId,
        variantSku: "",
        flashPrice: offer.flashPrice,
        regularPrice: regular,
        remaining: offer.remaining,
        perCustomerLimit: offer.perCustomerLimit,
      });
    }
  }

  if (!saleRef) return product;

  return {
    ...product,
    ...(productLevelFlashPrice !== null ? { salePrice: productLevelFlashPrice } : {}),
    variants: nextVariants,
    flashSale: {
      saleId: saleRef.saleId,
      title: saleRef.title,
      endAt: saleRef.endAt,
      variants: flashVariants,
    },
  };
}

export async function applyFlashPricingToProducts(products = []) {
  if (!Array.isArray(products) || products.length === 0) return products;
  const offers = await getActiveFlashOffers(products.map((p) => p?._id));
  if (offers.size === 0) return products;
  return products.map((product) => applyFlashPricingToProduct(product, offers));
}

/* ===============================
   Checkout: per-customer usage, reservation and release
================================ */

// Map(flashSaleItemId -> units this customer already holds in non-released orders)
export async function getCustomerFlashUsage(customerId, itemIds = [], { session = null } = {}) {
  const usage = new Map();
  const ids = toObjectIds(itemIds);
  if (!customerId || !mongoose.Types.ObjectId.isValid(String(customerId)) || ids.length === 0) {
    return usage;
  }

  const pipeline = Order.aggregate([
    {
      $match: {
        customer: new mongoose.Types.ObjectId(String(customerId)),
        flashSaleReleased: { $ne: true },
        "items.flashSaleItem": { $in: ids },
      },
    },
    { $unwind: "$items" },
    { $match: { "items.flashSaleItem": { $in: ids } } },
    { $group: { _id: "$items.flashSaleItem", quantity: { $sum: "$items.quantity" } } },
  ]);
  if (session) pipeline.session(session);
  const rows = await pipeline;
  for (const row of rows) usage.set(String(row._id), Number(row.quantity || 0));
  return usage;
}

/**
 * Atomically counts the flash units in the checkout as sold. Throws 409 when a deal
 * ended or ran out between pricing and placement, which aborts the whole order.
 */
export async function reserveFlashSaleQuantities(hydratedItems = [], { session = null } = {}) {
  const byItem = new Map();
  for (const line of hydratedItems) {
    if (!line?.flashSaleItemId) continue;
    const entry = byItem.get(line.flashSaleItemId) || {
      saleId: line.flashSaleId,
      productName: line.productName,
      quantity: 0,
    };
    entry.quantity += Number(line.quantity || 0);
    byItem.set(line.flashSaleItemId, entry);
  }

  const now = new Date();
  for (const [itemId, entry] of byItem) {
    const saleQuery = FlashSale.findOne(
      { _id: entry.saleId, ...liveSaleFilter(now) },
      { items: { $elemMatch: { _id: itemId } } },
    ).lean();
    if (session) saleQuery.session(session);
    const sale = await saleQuery;
    const item = sale?.items?.[0];
    if (!item) {
      throw httpError(409, `The flash deal on ${entry.productName} has ended. Please review your cart.`);
    }

    const maxSoldBefore = Number(item.totalQuantity) - entry.quantity;
    const result = maxSoldBefore < 0
      ? { modifiedCount: 0 }
      : await FlashSale.updateOne(
          {
            _id: entry.saleId,
            items: { $elemMatch: { _id: itemId, soldQuantity: { $lte: maxSoldBefore } } },
          },
          { $inc: { "items.$.soldQuantity": entry.quantity } },
          session ? { session } : {},
        );

    if (result.modifiedCount !== 1) {
      throw httpError(409, `The flash deal on ${entry.productName} just sold out. Please review your cart.`);
    }
  }
}

/**
 * Gives an order's flash units back to their sales (cancellation / payment failure).
 * Idempotent: the order is flagged atomically so a second call is a no-op.
 */
export async function releaseFlashSaleForOrder(order, { session = null } = {}) {
  if (!order || order.flashSaleReleased) return false;
  const flashLines = (order.items || []).filter((item) => item?.flashSale && item?.flashSaleItem);
  if (flashLines.length === 0) return false;

  const options = session ? { session } : {};
  const flagged = await Order.updateOne(
    { _id: order._id, flashSaleReleased: { $ne: true } },
    { $set: { flashSaleReleased: true } },
    options,
  );
  if (flagged.modifiedCount !== 1) return false;

  for (const line of flashLines) {
    await FlashSale.updateOne(
      {
        _id: line.flashSale,
        items: { $elemMatch: { _id: line.flashSaleItem, soldQuantity: { $gte: line.quantity } } },
      },
      { $inc: { "items.$.soldQuantity": -line.quantity } },
      options,
    );
  }

  order.flashSaleReleased = true;
  return true;
}

/* ===============================
   Sale validation (create / update / approve)
================================ */

function toPositiveInt(value, field, { min = 1 } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) {
    throw httpError(400, `${field} must be a whole number of at least ${min}`);
  }
  return n;
}

/**
 * Validates raw items from the request and returns items ready to store.
 * Keeps _id and soldQuantity of items that already exist on the sale.
 * When restrictToSellerId is set, every product must belong to that seller.
 */
export async function buildSaleItems(rawItems = [], { restrictToSellerId = null, existingItems = [] } = {}) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw httpError(400, "Add at least one product to the flash sale");
  }

  const products = await Product.find({ _id: { $in: toObjectIds(rawItems.map((i) => i?.product || i?.productId)) } })
    .select("_id name price salePrice sellerId variants status")
    .lean();
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const existingByKey = new Map(
    existingItems.map((item) => [flashLineKey(item.product, item.variantSku), item]),
  );

  const seen = new Set();
  const items = rawItems.map((raw) => {
    const productId = String(raw?.product || raw?.productId || "");
    const product = productById.get(productId);
    if (!product) throw httpError(400, `Product not found: ${productId}`);
    if (restrictToSellerId && String(product.sellerId) !== String(restrictToSellerId)) {
      throw httpError(403, `${product.name} is not one of your products`);
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const requestedSku = String(raw?.variantSku || "").trim();
    let variant = null;
    if (variants.length > 0) {
      variant = variants.find((v) => String(v?.sku || "").trim() === requestedSku) || null;
      if (!variant) throw httpError(400, `Choose a valid variant for ${product.name}`);
    }
    const variantSku = variant ? String(variant.sku || "").trim() : "";

    const key = flashLineKey(productId, variantSku);
    if (seen.has(key)) throw httpError(400, `${product.name} is added more than once`);
    seen.add(key);

    const regular = regularUnitPrice(product, variant);
    const flashPrice = Number(raw?.flashPrice);
    if (!Number.isFinite(flashPrice) || flashPrice <= 0) {
      throw httpError(400, `Enter a flash price for ${product.name}`);
    }
    if (flashPrice >= regular) {
      throw httpError(400, `Flash price for ${product.name} must be lower than its current price ₹${regular}`);
    }

    const totalQuantity = toPositiveInt(raw?.totalQuantity, `Sale quantity for ${product.name}`);
    const perCustomerLimit = toPositiveInt(raw?.perCustomerLimit ?? 0, `Per-customer limit for ${product.name}`, { min: 0 });

    const existing = existingByKey.get(key);
    const soldQuantity = Number(existing?.soldQuantity || 0);
    if (totalQuantity < soldQuantity) {
      throw httpError(400, `${product.name} has already sold ${soldQuantity} units; sale quantity cannot be lower`);
    }

    return {
      ...(existing?._id ? { _id: existing._id } : {}),
      product: product._id,
      sellerId: product.sellerId,
      variantSku,
      variantName: variant ? String(variant.name || "").trim() : "",
      flashPrice,
      totalQuantity,
      soldQuantity,
      perCustomerLimit,
    };
  });

  for (const existing of existingItems) {
    if (Number(existing.soldQuantity || 0) > 0 && !seen.has(flashLineKey(existing.product, existing.variantSku))) {
      throw httpError(400, "A product that already has flash sales cannot be removed. End the sale instead.");
    }
  }

  return items;
}

export function parseSaleWindow(startAtRaw, endAtRaw, { requireFutureEnd = true } = {}) {
  const startAt = new Date(startAtRaw);
  const endAt = new Date(endAtRaw);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw httpError(400, "Start and end time are required");
  }
  if (endAt <= startAt) throw httpError(400, "End time must be after start time");
  if (requireFutureEnd && endAt <= new Date()) throw httpError(400, "End time must be in the future");
  return { startAt, endAt };
}

// The same product variant cannot be in two approved sales whose time windows overlap.
export async function assertNoOverlappingSale({ items, startAt, endAt, excludeSaleId = null }) {
  const filter = {
    approvalStatus: FLASH_SALE_APPROVAL_STATUS.APPROVED,
    isActive: true,
    startAt: { $lt: endAt },
    endAt: { $gt: startAt },
    "items.product": { $in: items.map((i) => i.product) },
  };
  if (excludeSaleId) filter._id = { $ne: excludeSaleId };

  const clashes = await FlashSale.find(filter).select("title items").lean();
  if (clashes.length === 0) return;

  const wanted = new Set(items.map((i) => flashLineKey(i.product, i.variantSku)));
  for (const sale of clashes) {
    const clash = (sale.items || []).find((i) => wanted.has(flashLineKey(i.product, i.variantSku)));
    if (clash) {
      const product = await Product.findById(clash.product).select("name").lean();
      throw httpError(
        409,
        `${product?.name || "A product"}${clash.variantName ? ` (${clash.variantName})` : ""} is already in the flash sale "${sale.title}" at that time`,
      );
    }
  }
}
