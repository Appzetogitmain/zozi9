import express from "express";
import {
  getPublicFlashSales,
  listFlashSales,
  createFlashSale,
  updateFlashSale,
  reviewFlashSale,
  setFlashSaleActive,
  endFlashSale,
  deleteFlashSale,
} from "../controller/flashSaleController.js";
import {
  verifyToken,
  allowRoles,
  requireApprovedSeller,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Customer: live + upcoming sales near ?lat&lng
router.get("/", getPublicFlashSales);

// Admin: all sales (admin-created are auto-approved; seller sales need review)
const admin = [verifyToken, allowRoles("admin")];
router.get("/admin", ...admin, listFlashSales);
router.post("/admin", ...admin, createFlashSale);
router.put("/admin/:id", ...admin, updateFlashSale);
router.patch("/admin/:id/review", ...admin, reviewFlashSale);
router.patch("/admin/:id/active", ...admin, setFlashSaleActive);
router.patch("/admin/:id/end", ...admin, endFlashSale);
router.delete("/admin/:id", ...admin, deleteFlashSale);

// Seller: own sales only, every create/edit goes to admin for approval
const seller = [verifyToken, allowRoles("seller"), requireApprovedSeller];
router.get("/seller", ...seller, listFlashSales);
router.post("/seller", ...seller, createFlashSale);
router.put("/seller/:id", ...seller, updateFlashSale);
router.patch("/seller/:id/active", ...seller, setFlashSaleActive);
router.patch("/seller/:id/end", ...seller, endFlashSale);
router.delete("/seller/:id", ...seller, deleteFlashSale);

export default router;
