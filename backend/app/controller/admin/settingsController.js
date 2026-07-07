import Setting from "../../models/setting.js";
import handleResponse from "../../utils/helper.js";
import { normalizeProductApprovalConfig } from "../../services/productModerationService.js";
import MaintenanceAuditLog from "../../models/maintenanceAuditLog.js";
import { forceClearMaintenanceCache } from "../../middleware/maintenanceMiddleware.js";
import { broadcastMaintenanceStatus } from "../../socket/socketManager.js";

function flattenForMongoSet(prefix, value, target) {
  if (value === undefined) return;

  const isPlainObject =
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date);

  if (!isPlainObject) {
    target[prefix] = value;
    return;
  }

  const keys = Object.keys(value);
  if (!keys.length) {
    target[prefix] = value;
    return;
  }

  for (const key of keys) {
    flattenForMongoSet(`${prefix}.${key}`, value[key], target);
  }
}

export const getPlatformSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne({});

    if (!settings) {
      settings = await Setting.create({});
    }

    const result = settings?.toObject?.() || settings || {};
    result.productApproval = normalizeProductApprovalConfig(result);

    return handleResponse(
      res,
      200,
      "Platform settings fetched successfully",
      result,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updatePlatformSettings = async (req, res) => {
  try {
    const payload = req.body || {};
    const toSet = {};
    for (const [key, value] of Object.entries(payload)) {
      flattenForMongoSet(key, value, toSet);
    }

    const settings = await Setting.findOneAndUpdate(
      {},
      { $set: toSet },
      { new: true, upsert: true },
    );

    const result = settings?.toObject?.() || settings || {};
    result.productApproval = normalizeProductApprovalConfig(result);

    return handleResponse(
      res,
      200,
      "Platform settings updated successfully",
      result,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getMaintenanceSettings = async (req, res) => {
  try {
    const settings = await Setting.findOne().select('maintenanceMode').lean();
    return handleResponse(
      res,
      200,
      "Maintenance settings fetched",
      settings?.maintenanceMode || { enabled: false }
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateMaintenanceSettings = async (req, res) => {
  try {
    const payload = req.body;
    
    // Fetch previous to check for status change
    const oldSettings = await Setting.findOne().select('maintenanceMode').lean();
    const wasEnabled = oldSettings?.maintenanceMode?.enabled || false;

    const settings = await Setting.findOneAndUpdate(
      {},
      { $set: { maintenanceMode: payload } },
      { new: true, upsert: true }
    );

    const isEnabled = settings.maintenanceMode.enabled;

    // Determine action for audit log
    let action = "UPDATED";
    if (isEnabled && !wasEnabled) action = "ENABLED";
    else if (!isEnabled && wasEnabled) action = "DISABLED";

    // Emergency stop logic
    if (payload.emergencyStop) {
      action = "EMERGENCY_STOP";
    }

    // Save audit log
    if (action !== "UPDATED" || payload.auditReason) {
        await MaintenanceAuditLog.create({
            adminId: req.user.id,
            action: action,
            reason: payload.auditReason || "Admin manual update",
            details: settings.maintenanceMode
        });
    }

    // Clear middleware cache
    forceClearMaintenanceCache();

    // Broadcast via WebSockets
    broadcastMaintenanceStatus(settings.maintenanceMode);

    return handleResponse(
      res,
      200,
      "Maintenance settings updated",
      settings.maintenanceMode
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
