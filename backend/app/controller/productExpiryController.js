import mongoose from "mongoose";
import Product from "../models/product.js";
import handleResponse from "../utils/helper.js";
import getPagination from "../utils/pagination.js";
import { buildKey, invalidate } from "../services/cacheService.js";
import { enqueueProductIndex } from "../services/searchSyncService.js";
import {
  applyExpiryFields,
  expiredFilter,
  expiringSoonFilter,
  getExpiryState,
} from "../services/productExpiryService.js";

const LIST_FIELDS =
  "name mainImage sellerId stock status approvalStatus price salePrice variants expiryDate expiryAlertDays";

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Sellers only see their own products; admin can narrow to one seller
function baseScope(req) {
  if (req.user?.role === "seller") {
    return { sellerId: new mongoose.Types.ObjectId(String(req.user.id)) };
  }
  const { sellerId } = req.query;
  return sellerId && mongoose.Types.ObjectId.isValid(String(sellerId))
    ? { sellerId: new mongoose.Types.ObjectId(String(sellerId)) }
    : {};
}

function bucketFilter(bucket, now) {
  switch (bucket) {
    case "expired":
      return expiredFilter(now);
    case "expiring":
      return expiringSoonFilter(now);
    case "none":
      return { expiryDate: null };
    case "tracked":
      return { expiryDate: { $ne: null } };
    default:
      return {};
  }
}

function withExpiryState(product, now) {
  const { state, daysLeft } = getExpiryState(product, now);
  return { ...product, expiryState: state, daysLeft };
}

async function invalidateProductCaches(productId) {
  try {
    await enqueueProductIndex(String(productId));
    await invalidate(`cache:catalog:product:${productId}`);
    await invalidate(buildKey("catalog", "productList", "*"));
    await invalidate("cache:offersections:public:*");
  } catch (error) {
    console.error("Cache invalidation error (product expiry):", error);
  }
}

/* ===============================
   GET /products/expiry?bucket=expiring|expired|none|tracked|all&search&sellerId
================================ */
export const listExpiryProducts = async (req, res) => {
  try {
    const now = new Date();
    const bucket = String(req.query.bucket || "expiring").toLowerCase();
    const scope = baseScope(req);
    const search = String(req.query.search || "").trim();
    if (search) scope.name = { $regex: escapeRegex(search), $options: "i" };

    const { page, limit, skip } = getPagination(req, { defaultLimit: 20, maxLimit: 100 });
    const query = { ...scope, ...bucketFilter(bucket, now) };
    const sort = bucket === "none" ? { name: 1 } : bucket === "all" ? { createdAt: -1 } : { expiryDate: 1, name: 1 };

    const [items, total, expired, expiring, none, tracked] = await Promise.all([
      Product.find(query)
        .select(LIST_FIELDS)
        .populate("sellerId", "shopName")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(query),
      Product.countDocuments({ ...scope, ...expiredFilter(now) }),
      Product.countDocuments({ ...scope, ...expiringSoonFilter(now) }),
      Product.countDocuments({ ...scope, expiryDate: null }),
      Product.countDocuments({ ...scope, expiryDate: { $ne: null } }),
    ]);

    return handleResponse(res, 200, "Expiry products fetched", {
      items: items.map((item) => withExpiryState(item, now)),
      counts: { expired, expiring, none, tracked },
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   PATCH /products/:id/expiry  { expiryDate: "YYYY-MM-DD" | null, expiryAlertDays }
   Changing only the expiry never sends the product back for approval.
================================ */
export const updateProductExpiry = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user?.role === "seller") filter.sellerId = req.user.id;
    const product = await Product.findOne(filter).select("_id expiryDate").lean();
    if (!product) return handleResponse(res, 404, "Product not found");

    const update = applyExpiryFields(
      { expiryDate: req.body?.expiryDate, expiryAlertDays: req.body?.expiryAlertDays },
      product,
    );
    if (Object.keys(update).length === 0) {
      return handleResponse(res, 400, "Send expiryDate and/or expiryAlertDays");
    }

    const updated = await Product.findByIdAndUpdate(
      product._id,
      { $set: update },
      { new: true, runValidators: true },
    )
      .select(LIST_FIELDS)
      .populate("sellerId", "shopName")
      .lean();

    await invalidateProductCaches(product._id);

    const result = withExpiryState(updated, new Date());
    const message = result.expiryState === "expired"
      ? "Expiry saved. This product is expired and hidden from customers."
      : "Expiry date saved";
    return handleResponse(res, 200, message, result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
