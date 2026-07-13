import Coupon from "../models/coupon.js";
import handleResponse from "../utils/helper.js";
import Order from "../models/order.js";

export const listCoupons = async (req, res) => {
    try {
        const { status, search } = req.query;
        const query = {};

        if (status === "active") {
            const now = new Date();
            query.isActive = true;
            query.validFrom = { $lte: now };
            query.validTill = { $gte: now };
        } else if (status === "expired") {
            query.$or = [{ isActive: false }, { validTill: { $lt: new Date() } }];
        }

        if (search) {
            const term = search.trim();
            query.$or = [
                { code: { $regex: term, $options: "i" } },
                { title: { $regex: term, $options: "i" } },
                { description: { $regex: term, $options: "i" } },
            ];
        }

        const coupons = await Coupon.find(query).sort({ createdAt: -1 }).lean();
        return handleResponse(res, 200, "Coupons fetched successfully", coupons);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const createCoupon = async (req, res) => {
    try {
        const data = { ...req.body };
        const coupon = await Coupon.create(data);
        return handleResponse(res, 201, "Coupon created successfully", coupon);
    } catch (error) {
        if (error.code === 11000) {
            return handleResponse(res, 400, "Coupon code already exists");
        }
        return handleResponse(res, 500, error.message);
    }
};

export const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const data = { ...req.body };
        const coupon = await Coupon.findByIdAndUpdate(id, data, {
            new: true,
            runValidators: true,
        });
        if (!coupon) {
            return handleResponse(res, 404, "Coupon not found");
        }
        return handleResponse(res, 200, "Coupon updated successfully", coupon);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        await Coupon.findByIdAndDelete(id);
        return handleResponse(res, 200, "Coupon deleted successfully");
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Simple validation engine for checkout
export const validateCoupon = async (req, res) => {
    try {
        const { code, cartTotal, items, customerId } = req.body;

        if (!code) {
            return handleResponse(res, 400, "Coupon code is required");
        }

        const now = new Date();
        const coupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (!coupon) {
            return handleResponse(res, 404, "Invalid coupon code");
        }

        if (!coupon.isActive || coupon.validFrom > now || coupon.validTill < now) {
            return handleResponse(res, 400, "This coupon is not active");
        }

        // Usage limits (overall)
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
            return handleResponse(res, 400, "This coupon has reached its usage limit");
        }

        // Per-user limit & monthly volume – basic implementation
        let userUsageCount = 0;
        if (customerId) {
            // Check exact usage limit by querying orders with this coupon
            userUsageCount = await Order.countDocuments({
                customer: customerId,
                appliedCoupon: coupon._id
            });
        }

        if (coupon.perUserLimit && userUsageCount >= coupon.perUserLimit) {
            return handleResponse(res, 400, "You have already used this coupon");
        }

        // Base conditions
        if (coupon.minOrderValue && cartTotal < coupon.minOrderValue) {
            return handleResponse(
                res,
                400,
                `Minimum order value should be ₹${coupon.minOrderValue}`
            );
        }

        if (coupon.minItems && Array.isArray(items)) {
            const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
            if (totalQuantity < coupon.minItems) {
                return handleResponse(
                    res,
                    400,
                    `Add at least ${coupon.minItems} items to use this coupon`
                );
            }
        }

        // Category based condition
        if (
            coupon.couponType === "category_based" &&
            Array.isArray(coupon.applicableCategories) &&
            coupon.applicableCategories.length > 0
        ) {
            const hasEligibleItem =
                Array.isArray(items) &&
                items.some((i) =>
                    coupon.applicableCategories.some(
                        (cId) =>
                            String(i.categoryId) === String(cId) ||
                            String(i.subcategoryId) === String(cId) ||
                            String(i.headerId) === String(cId) ||
                            String(i.category?._id) === String(cId)
                    )
                );
            if (!hasEligibleItem) {
                return handleResponse(
                    res,
                    400,
                    "This coupon is valid only on selected categories"
                );
            }
        }

        // Calculate discount
        let discountAmount = 0;
        let freeDelivery = false;

        if (coupon.couponType === "buy_one_get_one") {
            if (Array.isArray(items) && items.length > 0) {
                const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
                if (totalQuantity >= 2) {
                    // Find cheapest item
                    let minPrice = Infinity;
                    items.forEach((item) => {
                        const price = Number(item.price) || 0;
                        if (price > 0 && price < minPrice) {
                            minPrice = price;
                        }
                    });
                    if (minPrice !== Infinity) {
                        discountAmount = minPrice;
                    }
                } else {
                    return handleResponse(res, 400, "Add at least 2 items to avail Buy One Get One offer");
                }
            } else {
                return handleResponse(res, 400, "Add items to your cart to use this coupon");
            }
        } else if (coupon.couponType === "free_delivery" || coupon.discountType === "free_delivery") {
            freeDelivery = true;
        } else if (coupon.discountType === "percentage") {
            discountAmount = Math.round((cartTotal * coupon.discountValue) / 100);
        } else if (coupon.discountType === "fixed") {
            discountAmount = coupon.discountValue;
        }

        if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
            discountAmount = coupon.maxDiscount;
        }

        if (discountAmount <= 0 && !freeDelivery) {
            return handleResponse(
                res,
                400,
                "This coupon does not provide any discount on current cart"
            );
        }

        return handleResponse(res, 200, "Coupon applied", {
            couponId: coupon._id,
            code: coupon.code,
            discountAmount,
            freeDelivery,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

