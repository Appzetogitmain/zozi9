import handleResponse from "../utils/helper.js";
import ReferralSettings from "../models/referralSettings.js";
import {
  applyReferralCodeSchema,
  listReferralsQuerySchema,
  referralSettingsSchema,
} from "../validation/referralValidation.js";
import {
  applyReferralCode,
  getMyReferralSummary,
  getReferralSettings,
  listReferralsForAdmin,
  toPublicProgram,
} from "../services/referralService.js";

function validate(schema, payload) {
  const { error, value } = schema.validate(payload || {}, { abortEarly: false, stripUnknown: true });
  if (error) {
    const err = new Error(error.details.map((d) => d.message).join("; "));
    err.statusCode = 400;
    throw err;
  }
  return value;
}

const fail = (res, error) =>
  handleResponse(res, error.statusCode || 500, error.message || "Something went wrong");

/* ===============================
   PUBLIC / CUSTOMER
================================ */

/** GET /referral/program  (signup page shows what the new customer gets) */
export const getProgram = async (_req, res) => {
  try {
    return handleResponse(res, 200, "Referral program fetched", toPublicProgram(await getReferralSettings()));
  } catch (error) {
    return fail(res, error);
  }
};

/** GET /referral/me */
export const getMyReferrals = async (req, res) => {
  try {
    return handleResponse(res, 200, "Referral summary fetched", await getMyReferralSummary(req.user.id));
  } catch (error) {
    return fail(res, error);
  }
};

/** POST /referral/apply  { code } */
export const applyCode = async (req, res) => {
  try {
    const { code } = validate(applyReferralCodeSchema, req.body);
    const result = await applyReferralCode({ customerId: req.user.id, code });
    return handleResponse(res, 200, result.message, result);
  } catch (error) {
    return fail(res, error);
  }
};

/* ===============================
   ADMIN
================================ */

export const getSettings = async (_req, res) => {
  try {
    return handleResponse(res, 200, "Referral settings fetched", await getReferralSettings());
  } catch (error) {
    return fail(res, error);
  }
};

export const updateSettings = async (req, res) => {
  try {
    const payload = validate(referralSettingsSchema, req.body);
    const update = { ...payload, updatedBy: req.user?.id || null };
    const settings = await ReferralSettings.findOneAndUpdate(
      { key: "default" },
      { $set: update, $setOnInsert: { key: "default" } },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
    ).lean();
    return handleResponse(res, 200, "Referral settings saved", settings);
  } catch (error) {
    return fail(res, error);
  }
};

export const listReferrals = async (req, res) => {
  try {
    const query = validate(listReferralsQuerySchema, req.query);
    return handleResponse(res, 200, "Referrals fetched", await listReferralsForAdmin(query));
  } catch (error) {
    return fail(res, error);
  }
};
