import express from "express";
import {
  createDeliverySlot,
  getAvailableSlots,
  updateDeliverySlot,
  deleteDeliverySlot
} from "../controller/deliverySlotController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public / Customer routes
router.get("/", getAvailableSlots);

// Admin routes
router.post("/", verifyToken, allowRoles("admin"), createDeliverySlot);
router.put("/:id", verifyToken, allowRoles("admin"), updateDeliverySlot);
router.delete("/:id", verifyToken, allowRoles("admin"), deleteDeliverySlot);

export default router;
