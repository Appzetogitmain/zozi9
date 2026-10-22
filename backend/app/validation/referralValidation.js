import Joi from "joi";
import { REFERRAL_REWARD_TYPES } from "../models/referralSettings.js";

const rewardConfigSchema = Joi.object({
  type: Joi.string().valid(...REFERRAL_REWARD_TYPES).required(),
  value: Joi.when("type", {
    is: "percentage",
    then: Joi.number().min(0).max(100).required(),
    otherwise: Joi.when("type", {
      is: "free_delivery",
      then: Joi.number().min(0).default(0),
      otherwise: Joi.number().min(0).max(100000).required(),
    }),
  }),
  maxDiscount: Joi.number().min(0).allow(null).default(null),
  minCartValue: Joi.number().min(0).default(0),
  validityDays: Joi.number().integer().min(1).max(365).default(30),
});

export const referralSettingsSchema = Joi.object({
  enabled: Joi.boolean(),
  referrerReward: rewardConfigSchema,
  refereeReward: rewardConfigSchema,
  minOrderValue: Joi.number().min(0),
  maxReferralsPerUser: Joi.number().integer().min(0),
}).min(1);

export const applyReferralCodeSchema = Joi.object({
  code: Joi.string().trim().min(3).max(32).required(),
});

export const listReferralsQuerySchema = Joi.object({
  status: Joi.string().valid("all", "pending", "completed").default("all"),
  search: Joi.string().trim().allow("").max(80).default(""),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});
