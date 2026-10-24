import Joi from "joi";
import mongoose from "mongoose";
import handleResponse from "../utils/helper.js";
import {
  getShopStatuses,
  getShopTiming,
  setShopOpenState,
  updateShopHours,
} from "../services/shopStatusService.js";
import {
  getNearbySellerIdsForCustomer,
  parseCustomerCoordinates,
} from "../services/customerVisibilityService.js";

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const hoursSchema = Joi.object({
  scheduleEnabled: Joi.boolean(),
  weeklyHours: Joi.array()
    .items(
      Joi.object({
        day: Joi.number().integer().min(0).max(6).required(),
        isOpen: Joi.boolean().required(),
        open: Joi.string().pattern(HM).required().messages({ "string.pattern.base": "Opening time must look like 09:00" }),
        close: Joi.string().pattern(HM).required().messages({ "string.pattern.base": "Closing time must look like 22:00" }),
      }),
    )
    .max(7),
  note: Joi.string().trim().allow("").max(120),
}).min(1);

const statusSchema = Joi.object({
  action: Joi.string().valid("open", "close", "auto").required(),
  keepClosed: Joi.boolean().default(false),
});

function validate(schema, payload) {
  const { error, value } = schema.validate(payload || {}, { abortEarly: false, stripUnknown: true });
  if (error) {
    const err = new Error(error.details.map((d) => d.message).join("; "));
    err.statusCode = 400;
    throw err;
  }
  return value;
}

const fail = (res, error) => handleResponse(res, error.statusCode || 500, error.message || "Something went wrong");

// Seller routes act on their own shop, admin routes on :id
function targetSeller(req) {
  const id = req.user?.role === "admin" ? req.params.id : req.user?.id;
  if (!mongoose.isValidObjectId(String(id || ""))) {
    const err = new Error("Invalid seller id");
    err.statusCode = 400;
    throw err;
  }
  return id;
}

const actorRole = (req) => (req.user?.role === "admin" ? "admin" : "seller");

export const getTiming = async (req, res) => {
  try {
    return handleResponse(res, 200, "Shop timing fetched", await getShopTiming(targetSeller(req)));
  } catch (error) {
    return fail(res, error);
  }
};

export const updateHours = async (req, res) => {
  try {
    const payload = validate(hoursSchema, req.body);
    const result = await updateShopHours(targetSeller(req), payload, actorRole(req));
    return handleResponse(res, 200, "Shop hours saved", result);
  } catch (error) {
    return fail(res, error);
  }
};

export const updateOpenState = async (req, res) => {
  try {
    const payload = validate(statusSchema, req.body);
    const result = await setShopOpenState(targetSeller(req), payload, actorRole(req));
    const message = result.status.isOpen ? "Shop is now open" : "Shop is now closed";
    return handleResponse(res, 200, message, result);
  } catch (error) {
    return fail(res, error);
  }
};

/** GET /seller/shop-status?lat&lng — open / closed state of the shops serving this location */
export const getNearbyShopStatuses = async (req, res) => {
  try {
    const coords = parseCustomerCoordinates(req.query || {});
    const now = new Date();
    if (!coords.valid) return handleResponse(res, 200, "Shop status fetched", { serverNow: now, shops: {} });

    const ids = await getNearbySellerIdsForCustomer(coords.lat, coords.lng);
    const statuses = await getShopStatuses(ids, { now });
    const shops = {};
    for (const [id, s] of statuses) {
      shops[id] = {
        shopName: s.shopName,
        isOpen: s.isOpen,
        opensAt: s.opensAt,
        closesAt: s.closesAt,
        note: s.note,
        label: s.label,
      };
    }
    return handleResponse(res, 200, "Shop status fetched", { serverNow: now, shops });
  } catch (error) {
    return fail(res, error);
  }
};
