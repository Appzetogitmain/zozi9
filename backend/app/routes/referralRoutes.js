import express from "express";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import { byIp, createRateLimiter } from "../middleware/rateLimiter.js";
import {
  getProgram,
  getMyReferrals,
  applyCode,
  getSettings,
  updateSettings,
  listReferrals,
} from "../controller/referralController.js";

// Stops code guessing: 10 apply attempts / 10 minutes / customer
const applyLimiter = createRateLimiter({
  namespace: "referral_apply",
  windowMs: 10 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => String(req.user?.id || byIp(req)),
  message: "Too many attempts. Please try again later.",
});

/* ---------------- Customer: mounted at /api/referral ---------------- */
export const referralCustomerRouter = express.Router();

const customerOnly = allowRoles("customer", "user");
referralCustomerRouter.get("/program", getProgram);
referralCustomerRouter.get("/me", verifyToken, customerOnly, getMyReferrals);
referralCustomerRouter.post("/apply", verifyToken, customerOnly, applyLimiter, applyCode);

/* ---------------- Admin: mounted at /api/admin/referrals ---------------- */
export const referralAdminRouter = express.Router();
referralAdminRouter.use(verifyToken, allowRoles("admin"));

referralAdminRouter.get("/settings", getSettings);
referralAdminRouter.patch("/settings", updateSettings);
referralAdminRouter.get("/", listReferrals);
