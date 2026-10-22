import express from "express";
import {
    getProducts,
    getSellerProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    getProductById,
    getModerationProducts,
    approveProduct,
    rejectProduct,
    bulkCreateProducts,
} from "../controller/productController.js";
import { adjustStock, getStockHistory } from "../controller/stockController.js";
import { listExpiryProducts, updateProductExpiry } from "../controller/productExpiryController.js";
import {
    verifyToken,
    allowRoles,
    optionalVerifyToken,
    requireApprovedSeller,
} from "../middleware/authMiddleware.js";
import multer from "multer";

const storage = multer.memoryStorage();
// Files are held in memory, so cap each one (videos are limited to 50MB in the UI)
const MAX_PRODUCT_UPLOAD_MB = parseInt(process.env.PRODUCT_MEDIA_MAX_MB || "60", 10);
const multerUpload = multer({ storage, limits: { fileSize: MAX_PRODUCT_UPLOAD_MB * 1024 * 1024 } });

// Same as multer().any(), but answers "file too large" with a clear 413 instead of a 500
const upload = {
    any: () => (req, res, next) =>
        multerUpload.any()(req, res, (err) => {
            if (err?.code === "LIMIT_FILE_SIZE") {
                return res.status(413).json({
                    success: false,
                    error: true,
                    message: `File is too large. Each photo or video must be under ${MAX_PRODUCT_UPLOAD_MB}MB.`,
                    result: {},
                });
            }
            return next(err);
        }),
};

const router = express.Router();

// Public routes with optional auth (to detect admin/seller vs customer)
router.get("/", optionalVerifyToken, getProducts);

// Seller protected routes
router.get("/seller/me", verifyToken, allowRoles("seller"), requireApprovedSeller, getSellerProducts);
router.post("/seller/me/bulk", verifyToken, allowRoles("seller"), requireApprovedSeller, bulkCreateProducts);
router.get("/stock-history", verifyToken, allowRoles("seller"), requireApprovedSeller, getStockHistory);
router.post("/adjust-stock", verifyToken, allowRoles("seller"), requireApprovedSeller, adjustStock);
router.get("/moderation", verifyToken, allowRoles("admin"), getModerationProducts);
router.patch("/moderation/:id/approve", verifyToken, allowRoles("admin"), approveProduct);
router.patch("/moderation/:id/reject", verifyToken, allowRoles("admin"), rejectProduct);
// Expiry management (seller: own products, admin: all)
router.get("/expiry", verifyToken, allowRoles("seller", "admin"), requireApprovedSeller, listExpiryProducts);
router.patch("/:id/expiry", verifyToken, allowRoles("seller", "admin"), requireApprovedSeller, updateProductExpiry);

router.get("/:id", optionalVerifyToken, getProductById);

router.post(
    "/",
    verifyToken,
    allowRoles("seller", "admin"),
    requireApprovedSeller,
    upload.any(),
    createProduct
);

router.put(
    "/:id",
    verifyToken,
    allowRoles("seller", "admin"),
    requireApprovedSeller,
    upload.any(),
    updateProduct
);

router.delete(
    "/:id",
    verifyToken,
    allowRoles("seller", "admin"),
    requireApprovedSeller,
    deleteProduct
);

export default router;
