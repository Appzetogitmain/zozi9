import Customer from "../models/customer.js";
import Transaction from "../models/transaction.js";
import jwt from "jsonwebtoken";
import handleResponse from "../utils/helper.js";
import {
    issueCustomerOtp,
    sanitizeCustomer,
    verifyCustomerOtpCode,
} from "../services/otpAuthService.js";
import {
    sendLoginOtpSchema,
    sendSignupOtpSchema,
    validateSchema,
    verifyOtpSchema,
} from "../validation/customerAuthValidation.js";

import { getFirebaseAdminApp } from "../config/firebaseAdmin.js";
import admin from "firebase-admin";

const generateToken = (customer) =>
    jwt.sign(
        { id: customer._id, role: "customer" },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

const generateRefreshToken = (customer) =>
    jwt.sign(
        { id: customer._id, role: "customer" },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d" }
    );

/* ===============================
   SIGNUP – Send OTP
================================ */
export const signupCustomer = async (req, res) => {
    try {
        const payload = validateSchema(sendSignupOtpSchema, req.body || {});

        await issueCustomerOtp({
            name: payload.name,
            rawPhone: payload.phone,
            flow: "signup",
            ipAddress: req.ip,
        });

        return handleResponse(res, 200, "If the number is eligible, OTP has been sent");
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   LOGIN – Send OTP
================================ */
export const loginCustomer = async (req, res) => {
    try {
        const payload = validateSchema(sendLoginOtpSchema, req.body || {});

        await issueCustomerOtp({
            rawPhone: payload.phone,
            flow: "login",
            ipAddress: req.ip,
        });

        return handleResponse(res, 200, "If the number is eligible, OTP has been sent");
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   CHECK PHONE
================================ */
export const checkCustomerPhone = async (req, res) => {
    try {
        const { phone } = req.body || {};
        if (!phone) {
            return handleResponse(res, 400, "Phone number is required");
        }
        const existing = await Customer.findOne({ phone: phone.trim() });
        return handleResponse(res, 200, "Phone check completed", {
            exists: Boolean(existing),
            isVerified: Boolean(existing?.isVerified),
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   VERIFY OTP – Login / Signup
================================ */
export const verifyCustomerOTP = async (req, res) => {
    try {
        const payload = validateSchema(verifyOtpSchema, req.body || {});
        const customer = await verifyCustomerOtpCode({
            rawPhone: payload.phone,
            otp: payload.otp,
            ipAddress: req.ip,
        });
        const token = generateToken(customer);
        const refreshToken = generateRefreshToken(customer);
        customer.refreshToken = refreshToken;
        customer.lastLogin = new Date();
        await customer.save();

        return handleResponse(
            res,
            200,
            "Login successful",
            {
                token,
                refreshToken,
                customer: sanitizeCustomer(customer),
            }
        );
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   FIREBASE LOGIN
================================ */
export const firebaseLoginCustomer = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return handleResponse(res, 400, "Firebase ID token is required");
        }

        const app = getFirebaseAdminApp();
        if (!app) {
            return handleResponse(res, 500, "Firebase Admin is not configured on the server");
        }

        const decodedToken = await admin.auth(app).verifyIdToken(token);
        const phone = decodedToken.phone_number;

        if (!phone) {
            return handleResponse(res, 400, "Phone number is missing in the Firebase token");
        }

        let customer = await Customer.findOne({ phone });

        if (!customer) {
            customer = await Customer.create({
                name: "Customer",
                phone,
                isVerified: true,
            });
        } else if (!customer.isVerified) {
            customer.isVerified = true;
        }

        const jwtToken = generateToken(customer);
        const refreshToken = generateRefreshToken(customer);
        customer.refreshToken = refreshToken;
        customer.lastLogin = new Date();
        await customer.save();

        return handleResponse(
            res,
            200,
            "Login successful",
            {
                token: jwtToken,
                refreshToken,
                customer: sanitizeCustomer(customer),
            }
        );
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   REFRESH TOKEN
================================ */
export const refreshCustomerToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return handleResponse(res, 401, "Refresh token is required");
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
        const customer = await Customer.findById(decoded.id).select("+refreshToken");

        if (!customer) {
            return handleResponse(res, 401, "Invalid refresh token");
        }

        const newAccessToken = generateToken(customer);

        return handleResponse(res, 200, "Token refreshed successfully", {
            token: newAccessToken,
            refreshToken: refreshToken,
        });
    } catch (error) {
        return handleResponse(res, 401, "Invalid or expired refresh token");
    }
};

/* ===============================
   GET PROFILE
================================ */
export const getCustomerProfile = async (req, res) => {
    try {
        const customer = await Customer.findById(req.user.id);
        if (!customer) {
            return handleResponse(res, 404, "Customer not found");
        }
        return handleResponse(res, 200, "Profile fetched successfully", customer);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   UPDATE PROFILE
================================ */
export const updateCustomerProfile = async (req, res) => {
    try {
        const { name, email, phone, addresses } = req.body;

        const customer = await Customer.findById(req.user.id);
        if (!customer) {
            return handleResponse(res, 404, "Customer not found");
        }

        if (name !== undefined) customer.name = name ? String(name).trim() : "";
        if (email !== undefined) customer.email = email ? String(email).trim() : undefined;
        if (phone !== undefined && String(phone).trim()) {
            customer.phone = String(phone).trim();
        }
        if (addresses) customer.addresses = addresses;

        await customer.save();

        return handleResponse(res, 200, "Profile updated successfully", sanitizeCustomer(customer));
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   GET WALLET TRANSACTIONS
================================ */
export const getCustomerTransactions = async (req, res) => {
    try {
        const customerId = req.user.id;
        const { page = 1, limit = 20 } = req.query;
        const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(50, Math.max(1, parseInt(limit, 10)));
        const perPage = Math.min(50, Math.max(1, parseInt(limit, 10)));

        const [transactions, total] = await Promise.all([
            Transaction.find({ user: customerId, userModel: "User" })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(perPage)
                .populate("order", "orderId")
                .lean(),
            Transaction.countDocuments({ user: customerId, userModel: "User" }),
        ]);

        const items = transactions.map((t) => ({
            _id: t._id,
            type: t.type === "Refund" ? "credit" : "debit",
            title: t.type === "Refund" ? "Refund" : t.type,
            amount: Math.abs(t.amount),
            date: t.createdAt,
            reference: t.reference,
            orderId: t.order?.orderId,
        }));

        return handleResponse(res, 200, "Transactions fetched", {
            items,
            total,
            page: parseInt(page, 10),
            totalPages: Math.ceil(total / perPage) || 1,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
