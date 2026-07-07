import handleResponse from "../utils/helper.js";
import Admin from "../models/admin.js";

export const checkPermission = (moduleName) => {
  return async (req, res, next) => {
    try {
      if (!req.user || req.user.role !== "admin") {
        return handleResponse(res, 401, "Unauthorized access");
      }

      const admin = await Admin.findById(req.user.id).populate("roleId").lean();

      if (!admin) {
        return handleResponse(res, 401, "Admin not found");
      }

      const isLegacySuperAdmin = admin.isSuperAdmin || !admin.roleId;
      if (isLegacySuperAdmin) {
        return next();
      }

      if (!admin.roleId.modules) {
        return handleResponse(res, 403, "Access denied. Invalid role.");
      }

      const hasAccess = admin.roleId.modules.includes(moduleName);

      if (!hasAccess) {
        return handleResponse(res, 403, `Access denied for module: ${moduleName}`);
      }

      next();
    } catch (error) {
      return handleResponse(res, 500, "Permission check failed");
    }
  };
};

export const requireSuperAdmin = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return handleResponse(res, 401, "Unauthorized access");
    }
    const admin = await Admin.findById(req.user.id).lean();
    const isLegacySuperAdmin = admin && (admin.isSuperAdmin || !admin.roleId);
    if (!isLegacySuperAdmin) {
      return handleResponse(res, 403, "Super Admin access required");
    }
    next();
  } catch (error) {
    return handleResponse(res, 500, "Permission check failed");
  }
};
