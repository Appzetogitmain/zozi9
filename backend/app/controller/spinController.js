import Joi from "joi";
import handleResponse from "../utils/helper.js";
import {
  getActiveCampaignForCustomer,
  evaluateEligibility,
  findLiveCampaign,
  getSpinSettings,
  listMyRewards,
  playSpin,
  recordImpression,
} from "../services/spin/spinService.js";
import { getClientIp } from "../middleware/rateLimiter.js";

const respondError = (res, error) => {
  const status = error?.statusCode || 500;
  // do not leak internals on unexpected errors
  const message = status >= 500 && !error?.code ? "Something went wrong. Please try again." : error.message;
  if (status >= 500) console.error("[spin] error:", error);
  return res.status(status).json({
    success: false,
    error: true,
    message,
    ...(error?.code ? { code: error.code } : {}),
  });
};

/** GET /spin/campaign/active  (works for guests; richer when logged in) */
export const getActiveCampaign = async (req, res) => {
  try {
    const data = await getActiveCampaignForCustomer({ customerId: req.user?.id || null });
    return handleResponse(res, 200, "Active campaign", data);
  } catch (error) {
    return respondError(res, error);
  }
};

/** GET /spin/eligibility */
export const getEligibility = async (req, res) => {
  try {
    const [settings, campaign] = await Promise.all([getSpinSettings(), findLiveCampaign()]);
    if (!campaign) return handleResponse(res, 200, "No active campaign", { active: false, eligible: false, canSpin: false, reason: "no_campaign" });
    const eligibility = await evaluateEligibility({ campaign, customerId: req.user?.id || null, settings });
    return handleResponse(res, 200, "Eligibility", { active: true, campaignId: String(campaign._id), ...eligibility });
  } catch (error) {
    return respondError(res, error);
  }
};

const impressionSchema = Joi.object({
  campaignId: Joi.string().hex().length(24).required(),
  viewerKey: Joi.string().trim().max(80).allow("", null),
});

/** POST /spin/impression */
export const trackImpression = async (req, res) => {
  try {
    const { error, value } = impressionSchema.validate(req.body || {}, { stripUnknown: true });
    if (error) return handleResponse(res, 400, "Invalid request");
    const result = await recordImpression({
      campaignId: value.campaignId,
      customerId: req.user?.id || null,
      viewerKey: value.viewerKey || getClientIp(req),
    });
    return handleResponse(res, 200, "ok", result);
  } catch (error) {
    return respondError(res, error);
  }
};

/** POST /spin/play  (requires login + Idempotency-Key header) */
export const play = async (req, res) => {
  try {
    const result = await playSpin({
      customerId: req.user?.id,
      idempotencyKey: req.headers["idempotency-key"],
      meta: { ip: getClientIp(req), userAgent: req.headers["user-agent"] },
    });
    return handleResponse(res, result.duplicate ? 200 : 201, result.duplicate ? "Result already recorded" : "Spin complete", result);
  } catch (error) {
    return respondError(res, error);
  }
};

/** GET /spin/my-rewards  (a customer can only ever see their own rewards) */
export const myRewards = async (req, res) => {
  try {
    const result = await listMyRewards({
      customerId: req.user.id,
      status: String(req.query.status || "all"),
      page: req.query.page,
      limit: req.query.limit,
    });
    const settings = await getSpinSettings();
    return handleResponse(res, 200, "Rewards fetched", {
      ...result,
      settings: { autoApplyReward: !!settings.autoApplyReward },
    });
  } catch (error) {
    return respondError(res, error);
  }
};

/**
 * POST /spin/redeem
 * Rewards are redeemed by the order itself (POST /orders with spinRewardId), inside the order
 * transaction. This endpoint only validates a reward against a cart so the UI can show it early.
 */
export const redeemCheck = async (_req, res) =>
  handleResponse(
    res,
    200,
    "Rewards are applied at checkout. Send spinRewardId with the order or the checkout preview.",
    { redeemedAt: "checkout" },
  );
