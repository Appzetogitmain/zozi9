import mongoose from "mongoose";
import handleResponse from "../utils/helper.js";
import SpinSettings from "../models/spinSettings.js";
import SpinCampaign from "../models/spinCampaign.js";
import SpinReward from "../models/spinReward.js";
import SpinAttempt from "../models/spinAttempt.js";
import {
  campaignCreateSchema,
  campaignStatusSchema,
  campaignUpdateSchema,
  reorderSchema,
  reportQuerySchema,
  rewardSchema,
  spinSettingsSchema,
} from "../validation/spinValidation.js";
import {
  effectiveCampaignStatus,
  probabilityMap,
  rangesOverlap,
  validateCampaignForActivation,
  validateRewardConfig,
  validateRewardSet,
} from "../services/spin/spinLogic.js";
import { getSpinSettings, toPublicCampaign } from "../services/spin/spinService.js";
import { buildSpinReport } from "../services/spin/spinReportService.js";

const MAX_AUDIT_ENTRIES = 100;

function validate(schema, payload) {
  const { error, value } = schema.validate(payload || {}, { abortEarly: false, stripUnknown: true });
  if (error) {
    const err = new Error(error.details.map((d) => d.message).join("; "));
    err.statusCode = 400;
    throw err;
  }
  return value;
}

const fail = (res, error) => {
  if (error?.code === 11000) return handleResponse(res, 409, "Duplicate value");
  return handleResponse(res, error.statusCode || 500, error.message || "Something went wrong");
};

const validId = (id) => mongoose.isValidObjectId(String(id || ""));

async function audit(campaignId, adminId, action, summary) {
  await SpinCampaign.updateOne(
    { _id: campaignId },
    {
      $push: {
        auditLog: {
          $each: [{ at: new Date(), by: adminId || null, action, summary: String(summary || "").slice(0, 300) }],
          $slice: -MAX_AUDIT_ENTRIES,
        },
      },
    },
  );
}

const emptyToNull = (v) => (v === "" || v === undefined ? null : v);

/** Normalises reward input coming from the admin form into schema-ready values */
function normaliseReward(input) {
  const out = { ...input };
  for (const key of ["maxDiscount", "totalQuantity", "perCustomerLimit", "validityDays"]) {
    if (key in out) out[key] = emptyToNull(out[key]) === null ? null : Number(out[key]);
  }
  if ("freeProductId" in out) out.freeProductId = emptyToNull(out.freeProductId);
  if (out.type === "free_delivery" || out.type === "no_prize") out.value = 0;
  if (out.type === "no_prize") {
    out.minCartValue = 0;
    out.maxDiscount = null;
  }
  if (out.type !== "free_product") out.freeProductId = null;
  return out;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export const getSettings = async (_req, res) => {
  try {
    return handleResponse(res, 200, "Spin & Win settings", await getSpinSettings());
  } catch (error) {
    return fail(res, error);
  }
};

export const updateSettings = async (req, res) => {
  try {
    const patch = validate(spinSettingsSchema, req.body);
    const updated = await SpinSettings.findOneAndUpdate(
      { key: "default" },
      { $set: { ...patch, updatedBy: req.user?.id || null }, $setOnInsert: { key: "default" } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
    console.info("[spin] settings updated", { by: req.user?.id, patch });
    return handleResponse(res, 200, "Settings saved", updated);
  } catch (error) {
    return fail(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* Campaigns                                                           */
/* ------------------------------------------------------------------ */

const withComputedFields = (campaign, rewards = [], counts = {}) => ({
  ...campaign,
  effectiveStatus: effectiveCampaignStatus(campaign),
  rewardCount: rewards.length,
  spinCount: counts[String(campaign._id)] || 0,
});

export const createCampaign = async (req, res) => {
  try {
    const data = validate(campaignCreateSchema, req.body);
    if (data.startAt && data.endAt && new Date(data.endAt) <= new Date(data.startAt)) {
      return handleResponse(res, 400, "End date must be after the start date");
    }
    const campaign = await SpinCampaign.create({
      ...data,
      status: "draft",
      createdBy: req.user?.id,
      updatedBy: req.user?.id,
      auditLog: [{ at: new Date(), by: req.user?.id, action: "created", summary: `Created "${data.name}"` }],
    });
    return handleResponse(res, 201, "Campaign created", campaign.toObject());
  } catch (error) {
    return fail(res, error);
  }
};

export const listCampaigns = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const query = {};
    if (req.query.status && req.query.status !== "all") query.status = String(req.query.status);

    const [items, total] = await Promise.all([
      SpinCampaign.find(query)
        .select("-auditLog")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SpinCampaign.countDocuments(query),
    ]);

    const ids = items.map((c) => c._id);
    const [spinRows, rewardRows] = await Promise.all([
      SpinAttempt.aggregate([{ $match: { campaignId: { $in: ids } } }, { $group: { _id: "$campaignId", n: { $sum: 1 } } }]),
      SpinReward.aggregate([
        { $match: { campaignId: { $in: ids }, isActive: true } },
        { $group: { _id: "$campaignId", n: { $sum: 1 } } },
      ]),
    ]);
    const spins = Object.fromEntries(spinRows.map((r) => [String(r._id), r.n]));
    const rewardCounts = Object.fromEntries(rewardRows.map((r) => [String(r._id), r.n]));

    return handleResponse(res, 200, "Campaigns fetched", {
      items: items.map((c) => ({
        ...withComputedFields(c, [], spins),
        rewardCount: rewardCounts[String(c._id)] || 0,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return fail(res, error);
  }
};

export const getCampaign = async (req, res) => {
  try {
    if (!validId(req.params.id)) return handleResponse(res, 400, "Invalid campaign id");
    const campaign = await SpinCampaign.findById(req.params.id).lean();
    if (!campaign) return handleResponse(res, 404, "Campaign not found");

    const rewards = await SpinReward.find({ campaignId: campaign._id }).sort({ sortOrder: 1, _id: 1 }).lean();
    const probabilities = probabilityMap(rewards);
    const liveSlices = rewards.filter((r) => r.isActive);
    const spinCount = await SpinAttempt.countDocuments({ campaignId: campaign._id });

    return handleResponse(res, 200, "Campaign fetched", {
      ...withComputedFields(campaign, rewards, { [String(campaign._id)]: spinCount }),
      rewards: rewards.map((r) => ({ ...r, probability: probabilities[String(r._id)] || 0 })),
      // exactly what the customer app will receive (no weights / stock)
      preview: toPublicCampaign(campaign, liveSlices),
      setErrors: validateRewardSet(rewards),
    });
  } catch (error) {
    return fail(res, error);
  }
};

export const updateCampaign = async (req, res) => {
  try {
    if (!validId(req.params.id)) return handleResponse(res, 400, "Invalid campaign id");
    const patch = validate(campaignUpdateSchema, req.body);

    const campaign = await SpinCampaign.findById(req.params.id);
    if (!campaign) return handleResponse(res, 404, "Campaign not found");
    if (campaign.status === "completed") {
      return handleResponse(res, 409, "A completed campaign cannot be edited");
    }

    const startAt = "startAt" in patch ? patch.startAt : campaign.startAt;
    const endAt = "endAt" in patch ? patch.endAt : campaign.endAt;
    if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
      return handleResponse(res, 400, "End date must be after the start date");
    }

    // dates of a live campaign must not start overlapping another one
    if (["active", "scheduled"].includes(campaign.status) && ("startAt" in patch || "endAt" in patch)) {
      const clash = await findOverlap(campaign._id, startAt, endAt);
      if (clash) return handleResponse(res, 409, `These dates overlap with "${clash.name}"`);
    }

    const changed = Object.keys(patch);
    for (const key of changed) {
      if (typeof patch[key] === "object" && patch[key] !== null && !(patch[key] instanceof Date)) {
        const current = campaign[key]?.toObject?.() || campaign[key] || {};
        campaign.set(key, { ...current, ...patch[key] });
      } else {
        campaign.set(key, patch[key]);
      }
    }
    campaign.updatedBy = req.user?.id;
    await campaign.save();
    await audit(campaign._id, req.user?.id, "updated", `Changed: ${changed.join(", ")}`);
    return handleResponse(res, 200, "Campaign updated", campaign.toObject());
  } catch (error) {
    return fail(res, error);
  }
};

async function findOverlap(excludeId, startAt, endAt) {
  if (!startAt || !endAt) return null;
  const others = await SpinCampaign.find({
    _id: { $ne: excludeId },
    status: { $in: ["active", "scheduled"] },
    startAt: { $ne: null },
    endAt: { $ne: null },
  })
    .select("name startAt endAt")
    .lean();
  return others.find((o) => rangesOverlap(startAt, endAt, o.startAt, o.endAt)) || null;
}

export const updateCampaignStatus = async (req, res) => {
  try {
    if (!validId(req.params.id)) return handleResponse(res, 400, "Invalid campaign id");
    const { status: target } = validate(campaignStatusSchema, req.body);

    const campaign = await SpinCampaign.findById(req.params.id);
    if (!campaign) return handleResponse(res, 404, "Campaign not found");

    const current = campaign.status;
    const allowed = {
      draft: ["active"],
      scheduled: ["paused", "completed"],
      active: ["paused", "completed"],
      paused: ["active", "completed", "draft"],
      completed: [],
    };
    if (!allowed[current]?.includes(target)) {
      return handleResponse(res, 409, `A ${current} campaign cannot become ${target}`);
    }

    if (target === "active") {
      const rewards = await SpinReward.find({ campaignId: campaign._id }).lean();
      const errors = [...validateCampaignForActivation(campaign), ...validateRewardSet(rewards)];
      if (errors.length) return handleResponse(res, 400, errors.join(". "));

      if (new Date(campaign.endAt) <= new Date()) {
        return handleResponse(res, 400, "The end date is already in the past");
      }
      const clash = await findOverlap(campaign._id, campaign.startAt, campaign.endAt);
      if (clash) {
        return handleResponse(res, 409, `Another campaign ("${clash.name}") is already scheduled for these dates`);
      }
      campaign.status = new Date(campaign.startAt) > new Date() ? "scheduled" : "active";
    } else if (target === "completed") {
      campaign.status = "completed";
      if (!campaign.endAt || new Date(campaign.endAt) > new Date()) campaign.endAt = new Date();
    } else {
      campaign.status = target;
    }

    campaign.updatedBy = req.user?.id;
    await campaign.save();
    await audit(campaign._id, req.user?.id, "status", `${current} -> ${campaign.status}`);
    console.info("[spin] campaign status changed", { id: String(campaign._id), from: current, to: campaign.status, by: req.user?.id });
    return handleResponse(res, 200, "Campaign status updated", campaign.toObject());
  } catch (error) {
    return fail(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* Rewards                                                             */
/* ------------------------------------------------------------------ */

export const addReward = async (req, res) => {
  try {
    if (!validId(req.params.id)) return handleResponse(res, 400, "Invalid campaign id");
    const campaign = await SpinCampaign.findById(req.params.id).lean();
    if (!campaign) return handleResponse(res, 404, "Campaign not found");
    if (campaign.status === "completed") return handleResponse(res, 409, "A completed campaign cannot be edited");

    const data = normaliseReward(validate(rewardSchema, req.body));
    const errors = validateRewardConfig(data);
    if (errors.length) return handleResponse(res, 400, errors.join(". "));

    const last = await SpinReward.findOne({ campaignId: campaign._id }).sort({ sortOrder: -1 }).select("sortOrder").lean();
    const reward = await SpinReward.create({
      ...data,
      campaignId: campaign._id,
      awardedCount: 0,
      sortOrder: data.sortOrder ?? (last ? last.sortOrder + 1 : 0),
    });
    await audit(campaign._id, req.user?.id, "reward_added", `Added "${reward.label}" (${reward.type})`);
    return handleResponse(res, 201, "Reward added", reward.toObject());
  } catch (error) {
    return fail(res, error);
  }
};

export const updateReward = async (req, res) => {
  try {
    if (!validId(req.params.id)) return handleResponse(res, 400, "Invalid reward id");
    const reward = await SpinReward.findById(req.params.id);
    if (!reward) return handleResponse(res, 404, "Reward not found");

    const patch = normaliseReward(validate(rewardSchema, req.body));
    delete patch.awardedCount; // inventory counters are never editable
    const merged = { ...reward.toObject(), ...patch };

    const errors = validateRewardConfig(merged);
    if (merged.totalQuantity != null && merged.totalQuantity < reward.awardedCount) {
      errors.push(`Total quantity cannot be lower than the ${reward.awardedCount} already awarded`);
    }
    if (errors.length) return handleResponse(res, 400, errors.join(". "));

    // never leave a live wheel in an invalid state
    const campaign = await SpinCampaign.findById(reward.campaignId).lean();
    if (campaign && ["active", "scheduled"].includes(campaign.status)) {
      const siblings = await SpinReward.find({ campaignId: reward.campaignId, _id: { $ne: reward._id } }).lean();
      const setErrors = validateRewardSet([...siblings, merged]);
      if (setErrors.length) return handleResponse(res, 400, `This change would break the live wheel: ${setErrors.join(". ")}`);
    }

    reward.set(patch);
    await reward.save();
    await audit(reward.campaignId, req.user?.id, "reward_updated", `Updated "${reward.label}": ${Object.keys(patch).join(", ")}`);
    return handleResponse(res, 200, "Reward updated", reward.toObject());
  } catch (error) {
    return fail(res, error);
  }
};

export const deleteReward = async (req, res) => {
  try {
    if (!validId(req.params.id)) return handleResponse(res, 400, "Invalid reward id");
    const reward = await SpinReward.findById(req.params.id);
    if (!reward) return handleResponse(res, 404, "Reward not found");

    const campaign = await SpinCampaign.findById(reward.campaignId).lean();
    if (campaign && ["active", "scheduled"].includes(campaign.status) && reward.isActive) {
      const siblings = await SpinReward.find({ campaignId: reward.campaignId, _id: { $ne: reward._id } }).lean();
      const setErrors = validateRewardSet(siblings);
      if (setErrors.length) return handleResponse(res, 400, `Cannot remove this reward from a live wheel: ${setErrors.join(". ")}`);
    }

    // Rewards that were already won stay in history: deactivate instead of deleting
    if (reward.awardedCount > 0) {
      reward.isActive = false;
      await reward.save();
      await audit(reward.campaignId, req.user?.id, "reward_deactivated", `Deactivated "${reward.label}" (already awarded ${reward.awardedCount}x)`);
      return handleResponse(res, 200, "This reward was already won by customers, so it was deactivated instead of deleted", reward.toObject());
    }

    await reward.deleteOne();
    await audit(reward.campaignId, req.user?.id, "reward_deleted", `Deleted "${reward.label}"`);
    return handleResponse(res, 200, "Reward deleted");
  } catch (error) {
    return fail(res, error);
  }
};

export const reorderRewards = async (req, res) => {
  try {
    if (!validId(req.params.id)) return handleResponse(res, 400, "Invalid campaign id");
    const { ids } = validate(reorderSchema, req.body);
    await SpinReward.bulkWrite(
      ids.map((id, index) => ({
        updateOne: { filter: { _id: id, campaignId: req.params.id }, update: { $set: { sortOrder: index } } },
      })),
    );
    await audit(req.params.id, req.user?.id, "rewards_reordered", `${ids.length} rewards reordered`);
    return handleResponse(res, 200, "Order saved");
  } catch (error) {
    return fail(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export const getReports = async (req, res) => {
  try {
    const query = validate(reportQuerySchema, req.query);
    const report = await buildSpinReport({
      campaignId: query.campaignId || null,
      from: query.from || null,
      to: query.to || null,
    });
    return handleResponse(res, 200, "Report generated", report);
  } catch (error) {
    return fail(res, error);
  }
};
