import FlashSale, { FLASH_SALE_APPROVAL_STATUS } from "../models/flashSale.js";
import Product from "../models/product.js";
import handleResponse from "../utils/helper.js";
import {
  parseCustomerCoordinates,
  getNearbySellerIdsForCustomer,
} from "../services/customerVisibilityService.js";
import {
  PRODUCT_APPROVAL_STATUS,
  resolveProductApprovalStatus,
} from "../services/productModerationService.js";
import {
  applyFlashPricingToProduct,
  assertNoOverlappingSale,
  buildSaleItems,
  flashLineKey,
  getSaleStatus,
  parseSaleWindow,
  regularUnitPrice,
} from "../services/flashSaleService.js";
import { notExpiredFilter } from "../services/productExpiryService.js";

// Customers also see sales that start within this window ("Starts in 02:10:00")
const UPCOMING_WINDOW_MS = 24 * 60 * 60 * 1000;

function sendError(res, error) {
  return handleResponse(res, error.statusCode || 500, error.message);
}

function isSellerRequest(req) {
  return req.user?.role === "seller";
}

// Sellers only ever see/touch their own sales
function scopedFilter(req, extra = {}) {
  return isSellerRequest(req) ? { ...extra, sellerId: req.user.id } : extra;
}

function withStatus(sale, now = new Date()) {
  const items = sale.items || [];
  return {
    ...sale,
    status: getSaleStatus(sale, now),
    totalUnits: items.reduce((sum, i) => sum + Number(i.totalQuantity || 0), 0),
    soldUnits: items.reduce((sum, i) => sum + Number(i.soldQuantity || 0), 0),
  };
}

function populateSale(query) {
  return query
    .populate("items.product", "name mainImage price salePrice variants")
    .populate("items.sellerId", "shopName")
    .populate("sellerId", "shopName");
}

async function loadScopedSale(req) {
  const sale = await FlashSale.findOne(scopedFilter(req, { _id: req.params.id }));
  if (!sale) {
    const err = new Error("Flash sale not found");
    err.statusCode = 404;
    throw err;
  }
  return sale;
}

async function respondWithSale(res, statusCode, message, saleId) {
  const sale = await populateSale(FlashSale.findById(saleId)).lean();
  return handleResponse(res, statusCode, message, withStatus(sale));
}

/* ===============================
   PUBLIC: live + upcoming sales near the customer
================================ */
export const getPublicFlashSales = async (req, res) => {
  try {
    const coords = parseCustomerCoordinates(req.query || {});
    if (!coords.valid) {
      return handleResponse(res, 200, "Flash sales fetched", { serverNow: new Date(), sales: [] });
    }

    const now = new Date();
    const sales = await FlashSale.find({
      approvalStatus: FLASH_SALE_APPROVAL_STATUS.APPROVED,
      isActive: true,
      endAt: { $gt: now },
      startAt: { $lte: new Date(now.getTime() + UPCOMING_WINDOW_MS) },
    })
      .sort({ startAt: 1, order: 1, createdAt: 1 })
      .lean();
    if (sales.length === 0) {
      return handleResponse(res, 200, "Flash sales fetched", { serverNow: new Date(), sales: [] });
    }

    const nearbySellerIds = new Set(
      (await getNearbySellerIdsForCustomer(coords.lat, coords.lng)).map(String),
    );
    const productIds = sales.flatMap((sale) => (sale.items || []).map((item) => item.product));
    const products = await Product.find({ _id: { $in: productIds }, status: "active", ...notExpiredFilter(now) })
      .select("name slug mainImage price salePrice stock weight variants sellerId headerId categoryId subcategoryId approvalStatus expiryDate")
      .lean();
    const productById = new Map(
      products
        .filter((p) => resolveProductApprovalStatus(p) === PRODUCT_APPROVAL_STATUS.APPROVED)
        .filter((p) => nearbySellerIds.has(String(p.sellerId)))
        .map((p) => [String(p._id), p]),
    );

    const result = sales
      .map((sale) => {
        const isLive = new Date(sale.startAt) <= now;
        const items = (sale.items || [])
          .map((item) => {
            const product = productById.get(String(item.product));
            if (!product) return null;
            const variant = (product.variants || []).find(
              (v) => String(v?.sku || "").trim() === item.variantSku,
            ) || null;
            if ((product.variants || []).length > 0 && !variant) return null;

            const regularPrice = regularUnitPrice(product, variant);
            if (!(item.flashPrice < regularPrice)) return null;
            const remaining = Math.max(0, item.totalQuantity - item.soldQuantity);

            // For live sales the product carries the flash price so ProductCard / cart pick it up
            const offer = {
              saleId: String(sale._id),
              itemId: String(item._id),
              title: sale.title,
              endAt: sale.endAt,
              variantSku: item.variantSku,
              flashPrice: item.flashPrice,
              remaining,
              perCustomerLimit: item.perCustomerLimit,
            };
            const pricedProduct = isLive && remaining > 0
              ? applyFlashPricingToProduct(product, new Map([[flashLineKey(product._id, item.variantSku), offer]]))
              : product;

            return {
              itemId: item._id,
              variantSku: item.variantSku,
              variantName: item.variantName,
              flashPrice: item.flashPrice,
              regularPrice,
              mrp: Number(variant?.price || product.price || regularPrice),
              totalQuantity: item.totalQuantity,
              soldQuantity: item.soldQuantity,
              remaining,
              perCustomerLimit: item.perCustomerLimit,
              product: pricedProduct,
            };
          })
          .filter(Boolean);

        return {
          _id: sale._id,
          title: sale.title,
          description: sale.description,
          startAt: sale.startAt,
          endAt: sale.endAt,
          status: isLive ? "live" : "upcoming",
          items,
        };
      })
      .filter((sale) => sale.items.length > 0);

    return handleResponse(res, 200, "Flash sales fetched", {
      serverNow: now,
      sales: result,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

/* ===============================
   ADMIN + SELLER MANAGEMENT
================================ */
export const listFlashSales = async (req, res) => {
  try {
    const filter = scopedFilter(req);
    if (req.query.approvalStatus && Object.values(FLASH_SALE_APPROVAL_STATUS).includes(req.query.approvalStatus)) {
      filter.approvalStatus = req.query.approvalStatus;
    }
    const sales = await populateSale(FlashSale.find(filter).sort({ createdAt: -1 })).lean();
    const now = new Date();
    return handleResponse(res, 200, "Flash sales fetched", sales.map((sale) => withStatus(sale, now)));
  } catch (error) {
    return sendError(res, error);
  }
};

export const createFlashSale = async (req, res) => {
  try {
    const { title, description = "", startAt, endAt, items, isActive = true } = req.body || {};
    if (!String(title || "").trim()) {
      return handleResponse(res, 400, "Title is required");
    }

    const seller = isSellerRequest(req);
    const window = parseSaleWindow(startAt, endAt);
    const saleItems = await buildSaleItems(items, {
      restrictToSellerId: seller ? req.user.id : null,
    });
    // Seller sales are checked again on approval; failing early gives sellers clear feedback
    await assertNoOverlappingSale({ items: saleItems, ...window });

    const sale = await FlashSale.create({
      title: String(title).trim(),
      description: String(description || "").trim(),
      ...window,
      items: saleItems,
      isActive: Boolean(isActive),
      createdByRole: seller ? "seller" : "admin",
      createdBy: req.user.id,
      sellerId: seller ? req.user.id : null,
      approvalStatus: seller
        ? FLASH_SALE_APPROVAL_STATUS.PENDING
        : FLASH_SALE_APPROVAL_STATUS.APPROVED,
      reviewedBy: seller ? null : req.user.id,
      reviewedAt: seller ? null : new Date(),
    });

    return respondWithSale(
      res,
      201,
      seller ? "Flash sale submitted for admin approval" : "Flash sale created",
      sale._id,
    );
  } catch (error) {
    return sendError(res, error);
  }
};

export const updateFlashSale = async (req, res) => {
  try {
    const sale = await loadScopedSale(req);
    const seller = isSellerRequest(req);
    const status = getSaleStatus(sale);

    if (seller && ["live", "ended"].includes(status)) {
      return handleResponse(res, 400, "A sale that has started cannot be edited. Pause or end it instead.");
    }

    const { title, description, startAt, endAt, items, isActive } = req.body || {};
    if (title !== undefined && !String(title).trim()) {
      return handleResponse(res, 400, "Title is required");
    }

    const window = parseSaleWindow(startAt ?? sale.startAt, endAt ?? sale.endAt);
    const saleItems = items !== undefined
      ? await buildSaleItems(items, {
          restrictToSellerId: sale.sellerId || null,
          existingItems: sale.items.map((item) => item.toObject()),
        })
      : sale.items.map((item) => item.toObject());

    // Any seller edit needs a fresh admin review
    const approvalStatus = seller ? FLASH_SALE_APPROVAL_STATUS.PENDING : sale.approvalStatus;
    if (approvalStatus === FLASH_SALE_APPROVAL_STATUS.APPROVED || seller) {
      await assertNoOverlappingSale({ items: saleItems, ...window, excludeSaleId: sale._id });
    }

    if (title !== undefined) sale.title = String(title).trim();
    if (description !== undefined) sale.description = String(description || "").trim();
    if (isActive !== undefined) sale.isActive = Boolean(isActive);
    sale.startAt = window.startAt;
    sale.endAt = window.endAt;
    sale.items = saleItems;
    sale.approvalStatus = approvalStatus;
    if (seller) {
      sale.rejectionReason = "";
      sale.reviewedBy = null;
      sale.reviewedAt = null;
    }
    await sale.save();

    return respondWithSale(
      res,
      200,
      seller ? "Flash sale updated and sent for approval" : "Flash sale updated",
      sale._id,
    );
  } catch (error) {
    return sendError(res, error);
  }
};

export const reviewFlashSale = async (req, res) => {
  try {
    const { action, reason = "" } = req.body || {};
    if (!["approve", "reject"].includes(action)) {
      return handleResponse(res, 400, "action must be approve or reject");
    }

    const sale = await loadScopedSale(req);
    if (action === "approve") {
      if (sale.endAt <= new Date()) {
        return handleResponse(res, 400, "This sale's end time has passed; ask the seller to update it");
      }
      await assertNoOverlappingSale({
        items: sale.items,
        startAt: sale.startAt,
        endAt: sale.endAt,
        excludeSaleId: sale._id,
      });
      sale.approvalStatus = FLASH_SALE_APPROVAL_STATUS.APPROVED;
      sale.rejectionReason = "";
    } else {
      sale.approvalStatus = FLASH_SALE_APPROVAL_STATUS.REJECTED;
      sale.rejectionReason = String(reason || "").trim();
    }
    sale.reviewedBy = req.user.id;
    sale.reviewedAt = new Date();
    await sale.save();

    return respondWithSale(res, 200, action === "approve" ? "Flash sale approved" : "Flash sale rejected", sale._id);
  } catch (error) {
    return sendError(res, error);
  }
};

export const setFlashSaleActive = async (req, res) => {
  try {
    const sale = await loadScopedSale(req);
    sale.isActive = Boolean(req.body?.isActive);
    await sale.save();
    return respondWithSale(res, 200, sale.isActive ? "Flash sale resumed" : "Flash sale paused", sale._id);
  } catch (error) {
    return sendError(res, error);
  }
};

export const endFlashSale = async (req, res) => {
  try {
    const sale = await loadScopedSale(req);
    const now = new Date();
    if (sale.endAt > now) {
      if (sale.startAt > now) sale.startAt = now;
      sale.endAt = now;
      await sale.save();
    }
    return respondWithSale(res, 200, "Flash sale ended", sale._id);
  } catch (error) {
    return sendError(res, error);
  }
};

export const deleteFlashSale = async (req, res) => {
  try {
    const sale = await loadScopedSale(req);
    if (sale.items.some((item) => Number(item.soldQuantity || 0) > 0)) {
      return handleResponse(res, 400, "This sale already has orders. End it instead of deleting it.");
    }
    await sale.deleteOne();
    return handleResponse(res, 200, "Flash sale deleted", { _id: sale._id });
  } catch (error) {
    return sendError(res, error);
  }
};
