import Joi from "joi";
import { REWARD_TYPES } from "../services/spin/spinLogic.js";

const objectId = Joi.string().hex().length(24);
const optionalNumber = Joi.number().allow(null, "");

export const spinSettingsSchema = Joi.object({
  enabled: Joi.boolean(),
  popupEnabled: Joi.boolean(),
  allowRedemptionWhenDisabled: Joi.boolean(),
  autoApplyReward: Joi.boolean(),
  restoreOnCancel: Joi.boolean(),
  restoreOnRefund: Joi.boolean(),
}).min(1);

const campaignFields = {
  name: Joi.string().trim().min(2).max(120),
  title: Joi.string().trim().max(120).allow(""),
  description: Joi.string().trim().max(500).allow(""),
  bannerImage: Joi.string().trim().max(1000).allow(""),
  startAt: Joi.date().iso().allow(null),
  endAt: Joi.date().iso().allow(null),
  popup: Joi.object({
    delaySeconds: Joi.number().integer().min(0).max(60),
    frequency: Joi.string().valid("every_session", "daily", "weekly", "once"),
  }),
  requireLogin: Joi.boolean(),
  eligibility: Joi.object({
    audience: Joi.string().valid("all", "new_customers", "existing_customers"),
    minOrders: Joi.number().integer().min(0).max(1000),
  }),
  participation: Joi.object({
    maxSpins: Joi.number().integer().min(1).max(1000),
    period: Joi.string().valid("campaign", "day", "week", "month"),
  }),
  rewardValidityDays: Joi.number().integer().min(1).max(365),
  terms: Joi.string().trim().max(4000).allow(""),
};

export const campaignCreateSchema = Joi.object({
  ...campaignFields,
  name: campaignFields.name.required(),
});

export const campaignUpdateSchema = Joi.object(campaignFields).min(1);

export const campaignStatusSchema = Joi.object({
  status: Joi.string().valid("active", "paused", "draft", "completed").required(),
});

export const rewardSchema = Joi.object({
  label: Joi.string().trim().min(1).max(40),
  color: Joi.string()
    .trim()
    .pattern(/^(#[0-9a-fA-F]{3,8})?$/)
    .allow(""),
  icon: Joi.string().trim().max(30),
  type: Joi.string().valid(...REWARD_TYPES),
  value: Joi.number().min(0).max(100000),
  weight: Joi.number().min(0).max(1000000),
  minCartValue: Joi.number().min(0).max(10000000),
  maxDiscount: optionalNumber,
  totalQuantity: optionalNumber,
  perCustomerLimit: optionalNumber,
  validityDays: optionalNumber,
  eligibleCategoryIds: Joi.array().items(objectId).max(100),
  eligibleProductIds: Joi.array().items(objectId).max(200),
  eligibleSellerIds: Joi.array().items(objectId).max(100),
  freeProductId: objectId.allow(null, ""),
  isActive: Joi.boolean(),
  sortOrder: Joi.number().integer().min(0).max(1000),
});

export const reorderSchema = Joi.object({
  ids: Joi.array().items(objectId).min(1).max(50).required(),
});

export const reportQuerySchema = Joi.object({
  campaignId: objectId.allow("", null),
  from: Joi.date().iso().allow("", null),
  to: Joi.date().iso().allow("", null),
});
