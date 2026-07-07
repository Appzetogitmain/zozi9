import Admin from "../models/admin.js";
import jwt from "jsonwebtoken";
import handleResponse from "../utils/helper.js";
import {
  bootstrapAdminSchema,
  loginAdminSchema,
  validateSchema,
} from "../validation/adminAuthValidation.js";

const PUBLIC_ADMIN_SIGNUP_ENABLED = () =>
  process.env.ENABLE_PUBLIC_ADMIN_SIGNUP === "true";

function sanitizeAdmin(adminDoc) {
  const admin = adminDoc?.toObject ? adminDoc.toObject() : { ...(adminDoc || {}) };
  delete admin.password;
  delete admin.__v;
  return admin;
}

const generateToken = (admin) =>
  jwt.sign(
    { 
      id: admin._id, 
      role: "admin", 
      isSuperAdmin: admin.isSuperAdmin, 
      roleId: admin.roleId 
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );

function readBootstrapSecret(req) {
  return String(
    req.headers["x-admin-bootstrap-secret"] ||
      req.body?.adminSecret ||
      "",
  ).trim();
}

export const bootstrapAdmin = async (req, res) => {
  try {
    const configuredSecret = String(process.env.ADMIN_BOOTSTRAP_SECRET || "").trim();
    if (!configuredSecret) {
      return handleResponse(res, 503, "Admin bootstrap is not configured");
    }

    const suppliedSecret = readBootstrapSecret(req);
    if (!suppliedSecret || suppliedSecret !== configuredSecret) {
      return handleResponse(res, 403, "Invalid admin bootstrap secret");
    }

    const existingCount = await Admin.countDocuments({});
    if (existingCount > 0) {
      return handleResponse(res, 409, "Admin bootstrap is disabled after initial setup");
    }

    const payload = validateSchema(bootstrapAdminSchema, req.body || {});
    const duplicate = await Admin.findOne({ email: payload.email }).lean();
    if (duplicate) {
      return handleResponse(res, 409, "Admin already exists");
    }

    const admin = await Admin.create({
      name: payload.name,
      email: payload.email,
      password: payload.password,
      role: "admin",
      isSuperAdmin: true,
      isVerified: true,
    });

    const token = generateToken(admin);
    return handleResponse(res, 201, "Admin bootstrapped successfully", {
      token,
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const signupAdmin = async (req, res) => {
  try {
    if (!PUBLIC_ADMIN_SIGNUP_ENABLED()) {
      return handleResponse(
        res,
        403,
        "Public admin signup is disabled. Use secure bootstrap flow.",
      );
    }

    const existingCount = await Admin.countDocuments({});
    if (existingCount > 0) {
      return handleResponse(res, 403, "Public admin signup is disabled after bootstrap");
    }

    const payload = validateSchema(bootstrapAdminSchema, req.body || {});
    const admin = await Admin.create({
      name: payload.name,
      email: payload.email,
      password: payload.password,
      role: "admin",
      isSuperAdmin: false,
      isVerified: true,
    });

    const token = generateToken(admin);
    return handleResponse(res, 201, "Admin registered successfully", {
      token,
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const loginAdmin = async (req, res) => {
  try {
    const payload = validateSchema(loginAdminSchema, req.body || {});

    const admin = await Admin.findOne({ email: payload.email }).select("+password");
    if (!admin) {
      return handleResponse(res, 401, "Invalid credentials");
    }

    if (!admin.isActive) {
      return handleResponse(res, 403, "Your account has been deactivated. Contact Super Admin.");
    }

    const isMatch = await admin.comparePassword(payload.password);
    if (!isMatch) {
      return handleResponse(res, 401, "Invalid credentials");
    }

    admin.lastLogin = new Date();
    await admin.save();

    const token = generateToken(admin);
    return handleResponse(res, 200, "Login successful", {
      token,
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const inviteAdmin = async (req, res) => {
  try {
    const { email, roleId, name } = req.body;
    
    if (!email) {
      return handleResponse(res, 400, "Email is required");
    }

    const duplicate = await Admin.findOne({ email });
    if (duplicate) {
      if (duplicate.isVerified) {
        return handleResponse(res, 409, "Admin with this email already exists");
      }
      // If unverified, we will resend OTP instead of erroring
    }

    const { generateOTP } = await import("../utils/otp.js");
    const { sendAdminInvitationOtpEmail } = await import("../services/emailService.js");
    const bcrypt = await import("bcrypt");

    const otp = generateOTP();
    const hashedOtp = await bcrypt.hash(otp, 10);
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    let admin = duplicate;
    if (admin) {
      admin.setupOtp = hashedOtp;
      admin.setupOtpExpiry = otpExpiry;
      if (name) admin.name = name;
      if (roleId) admin.roleId = roleId;
      await admin.save();
    } else {
      admin = await Admin.create({
        name: name || "New Admin",
        email,
        roleId: roleId || null,
        isVerified: false,
        password: await bcrypt.hash(Math.random().toString(36).slice(-8), 10), // temp random
        setupOtp: hashedOtp,
        setupOtpExpiry: otpExpiry,
      });
    }

    await sendAdminInvitationOtpEmail({
      email,
      otp,
      expiresInMinutes: 15,
    });

    return handleResponse(res, 201, "Admin invited successfully", { email });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const verifyAdminOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return handleResponse(res, 400, "Email and OTP are required");
    }

    const admin = await Admin.findOne({ email }).select("+setupOtp +setupOtpExpiry");
    if (!admin) {
      return handleResponse(res, 404, "Admin not found");
    }

    if (admin.isVerified) {
      return handleResponse(res, 400, "Admin is already verified");
    }

    if (!admin.setupOtp || !admin.setupOtpExpiry || new Date() > admin.setupOtpExpiry) {
      return handleResponse(res, 400, "OTP has expired or is invalid");
    }

    const bcrypt = await import("bcrypt");
    const isMatch = await bcrypt.compare(otp, admin.setupOtp);
    if (!isMatch) {
      return handleResponse(res, 400, "Invalid OTP");
    }

    // Generate a temporary setup token
    const setupToken = jwt.sign(
      { id: admin._id, email: admin.email, setup: true },
      process.env.JWT_SECRET,
      { expiresIn: "30m" }
    );

    return handleResponse(res, 200, "OTP verified", { setupToken });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const setupAdminPassword = async (req, res) => {
  try {
    const { setupToken, password, name, roleId } = req.body;
    
    if (!setupToken || !password) {
      return handleResponse(res, 400, "Setup token and password are required");
    }

    let decoded;
    try {
      decoded = jwt.verify(setupToken, process.env.JWT_SECRET);
    } catch (e) {
      return handleResponse(res, 401, "Invalid or expired setup token");
    }

    if (!decoded.setup) {
      return handleResponse(res, 403, "Invalid token type");
    }

    const admin = await Admin.findById(decoded.id);
    if (!admin) {
      return handleResponse(res, 404, "Admin not found");
    }

    admin.password = password; // will be hashed by pre-save hook
    if (name) admin.name = name;
    if (roleId) admin.roleId = roleId;
    admin.isVerified = true;
    admin.setupOtp = undefined;
    admin.setupOtpExpiry = undefined;
    await admin.save();

    return handleResponse(res, 200, "Password set successfully. You can now login.");
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getAdmins = async (req, res) => {
  try {
    const admins = await Admin.find().select("-password -setupOtp");
    return handleResponse(res, 200, "Admins fetched successfully", admins);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const toggleAdminStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Prevent super admins from deactivating themselves
    if (req.user.id === id) {
      return handleResponse(res, 400, "You cannot deactivate your own account");
    }

    const admin = await Admin.findById(id);
    if (!admin) {
      return handleResponse(res, 404, "Admin not found");
    }

    admin.isActive = !admin.isActive;
    await admin.save();

    return handleResponse(res, 200, `Admin ${admin.isActive ? 'activated' : 'deactivated'} successfully`);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
