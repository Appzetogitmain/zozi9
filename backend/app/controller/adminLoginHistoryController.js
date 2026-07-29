import LoginHistory from "../models/loginHistory.js";
import handleResponse from "../utils/helper.js";

export const getLoginHistory = async (req, res) => {
    try {
        const { role, page = 1, limit = 20 } = req.query;

        const query = {};
        if (role) {
            query.role = role;
        }

        const total = await LoginHistory.countDocuments(query);
        const loginHistory = await LoginHistory.find(query)
            .sort({ createdAt: -1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .populate("userId", "name email phone isActive isVerified"); 
            // Select basic identifying fields

        return handleResponse(res, 200, "Login history fetched successfully", {
            loginHistory,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
