import Setting from "../models/setting.js";
import handleResponse from "../utils/helper.js";
import jwt from "jsonwebtoken";

let cachedMaintenanceConfig = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 10000; // 10 seconds

function extractJwtFromHeaders(req) {
  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader) {
    const parts = authHeader.split(/\s+/);
    if (parts.length >= 2 && /^bearer$/i.test(parts[0])) {
      return parts[1];
    }
    if (authHeader.split(".").length === 3) {
      return authHeader;
    }
  }

  const xAccessToken = String(req.headers["x-access-token"] || "").trim();
  if (xAccessToken && xAccessToken.split(".").length === 3) {
    return xAccessToken;
  }
  return null;
}

export const maintenanceMiddleware = async (req, res, next) => {
    try {
        const now = Date.now();
        if (!cachedMaintenanceConfig || now - lastCacheTime > CACHE_TTL_MS) {
            const settings = await Setting.findOne().select('maintenanceMode').lean();
            if (settings && settings.maintenanceMode) {
                cachedMaintenanceConfig = settings.maintenanceMode;
            } else {
                cachedMaintenanceConfig = { enabled: false };
            }
            lastCacheTime = now;
        }

        const config = cachedMaintenanceConfig;

        if (!config.enabled) {
            return next();
        }

        // Allow bypassing for specific IPs
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (config.allowedIPs && config.allowedIPs.includes(clientIp)) {
            return next();
        }

        // Allow bypassing for specific roles
        let userRole = null;
        const token = extractJwtFromHeaders(req);
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userRole = decoded.role;
                if (decoded.isSuperAdmin) {
                    userRole = 'superadmin';
                }
            } catch (e) {
                // Ignore invalid tokens here
            }
        }

        const allowedRoles = config.allowedRoles || ['admin'];
        if (userRole && allowedRoles.includes(userRole)) {
            return next();
        }
        
        // Allow admin access by default to avoid accidental lockouts
        if (userRole === 'admin') {
            return next();
        }

        return res.status(503).json({
            success: false,
            message: config.message || 'Service is under maintenance',
            maintenance: true,
            title: config.title || 'Scheduled Maintenance',
            estimatedEndTime: config.estimatedEndTime
        });
    } catch (error) {
        // Fallback: proceed if there's an error fetching settings to avoid blocking production completely
        console.error("Maintenance middleware error:", error);
        next();
    }
};

export const forceClearMaintenanceCache = () => {
    cachedMaintenanceConfig = null;
    lastCacheTime = 0;
};
