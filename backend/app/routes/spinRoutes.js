import express from "express";
import { verifyToken, optionalVerifyToken, allowRoles } from "../middleware/authMiddleware.js";
import { byIp, createRateLimiter } from "../middleware/rateLimiter.js";
import {
  getActiveCampaign,
  getEligibility,
  trackImpression,
  play,
  myRewards,
  redeemCheck,
} from "../controller/spinController.js";
import {
  getSettings,
  updateSettings,
  createCampaign,
  listCampaigns,
  getCampaign,
  updateCampaign,
  updateCampaignStatus,
  addReward,
  updateReward,
  deleteReward,
  reorderRewards,
  getReports,
} from "../controller/spinAdminController.js";

const byUserOrIp = (req) => String(req.user?.id || byIp(req));

// 10 spin requests / minute / customer (a customer normally has 1-3 spins in total)
const playLimiter = createRateLimiter({
  namespace: "spin_play",
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: byUserOrIp,
  message: "Too many spin attempts. Please wait a moment.",
});
const readLimiter = createRateLimiter({
  namespace: "spin_read",
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: byUserOrIp,
});
const impressionLimiter = createRateLimiter({
  namespace: "spin_impression",
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: byUserOrIp,
});

/* ---------------- Customer: mounted at /api/spin ---------------- */
export const spinCustomerRouter = express.Router();

spinCustomerRouter.get("/campaign/active", readLimiter, optionalVerifyToken, getActiveCampaign);
spinCustomerRouter.get("/eligibility", readLimiter, optionalVerifyToken, getEligibility);
spinCustomerRouter.post("/impression", impressionLimiter, optionalVerifyToken, trackImpression);

const customerOnly = allowRoles("customer", "user");
spinCustomerRouter.post("/play", verifyToken, customerOnly, playLimiter, play);
spinCustomerRouter.get("/my-rewards", verifyToken, customerOnly, readLimiter, myRewards);
spinCustomerRouter.post("/redeem", verifyToken, customerOnly, redeemCheck);

/* ---------------- Admin: mounted at /api/admin/spin ---------------- */
export const spinAdminRouter = express.Router();
spinAdminRouter.use(verifyToken, allowRoles("admin"));

spinAdminRouter.get("/settings", getSettings);
spinAdminRouter.patch("/settings", updateSettings);

spinAdminRouter.get("/reports", getReports);

spinAdminRouter.post("/campaigns", createCampaign);
spinAdminRouter.get("/campaigns", listCampaigns);
spinAdminRouter.get("/campaigns/:id", getCampaign);
spinAdminRouter.patch("/campaigns/:id", updateCampaign);
spinAdminRouter.patch("/campaigns/:id/status", updateCampaignStatus);
spinAdminRouter.post("/campaigns/:id/rewards", addReward);
spinAdminRouter.put("/campaigns/:id/rewards/order", reorderRewards);

spinAdminRouter.patch("/rewards/:id", updateReward);
spinAdminRouter.delete("/rewards/:id", deleteReward);
