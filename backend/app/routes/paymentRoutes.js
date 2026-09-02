import express from "express";
import {
  createPaymentOrder,
  verifyClientPayment,
  handleRazorpayWebhook,
} from "../controller/paymentController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { paymentRouteRateLimiter } from "../middleware/securityMiddlewares.js";

const paymentRoute = express.Router();

/**
 * Initiate a PhonePe payment order for a specific CheckoutGroupId or OrderId.
 * Auth: Required (Customer paying for their own order)
 */
paymentRoute.post(
  "/create-order",
  verifyToken,
  paymentRouteRateLimiter,
  createPaymentOrder,
);

/**
 * Verify payment status from client side (after success from Razorpay widget).
 * Auth: Required
 */
paymentRoute.post(
  "/verify",
  verifyToken,
  paymentRouteRateLimiter,
  verifyClientPayment,
);

/**
 * Razorpay Server-to-Server Webhook.
 * Auth: None (Internal verification via x-razorpay-signature header)
 */
paymentRoute.post(
  "/webhook/razorpay",
  express.raw({ type: "application/json" }), // Need raw body for HMAC verification
  handleRazorpayWebhook,
);

export default paymentRoute;
