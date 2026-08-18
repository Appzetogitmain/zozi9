import Order from "../models/order.js";
import { handleResponse } from "../utils/helper.js";
import mongoose from "mongoose";

export const getProductSales = async (req, res) => {
    try {
        const { startDate, endDate, statusType = 'delivered' } = req.query;

        // 1. Build the match query
        const matchQuery = {};

        // Date Filtering
        if (startDate && endDate) {
            matchQuery.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        } else if (startDate) {
            matchQuery.createdAt = { $gte: new Date(startDate) };
        } else if (endDate) {
            matchQuery.createdAt = { $lte: new Date(endDate) };
        }

        // Status Filtering
        if (statusType === 'delivered') {
            matchQuery.status = "delivered";
        } else if (statusType === 'pending') {
            matchQuery.status = { $in: ["pending", "confirmed", "packed", "out_for_delivery"] };
        }

        // 2. Aggregation Pipeline
        const pipeline = [
            { $match: matchQuery },
            { $unwind: "$items" },
            {
                $group: {
                    _id: "$items.product",
                    productName: { $first: "$items.name" },
                    totalQuantity: { $sum: "$items.quantity" },
                    totalRevenue: { 
                        $sum: { $multiply: ["$items.quantity", "$items.price"] } 
                    }
                }
            },
            {
                $lookup: {
                    from: "products",
                    localField: "_id",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            {
                $unwind: {
                    path: "$productDetails",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: 1,
                    productName: { $ifNull: ["$productDetails.name", "$productName"] },
                    productImage: { $arrayElemAt: ["$productDetails.images", 0] },
                    category: "$productDetails.category",
                    subCategory: "$productDetails.subCategory",
                    totalQuantity: 1,
                    totalRevenue: 1
                }
            },
            { $sort: { totalQuantity: -1 } }
        ];

        const salesData = await Order.aggregate(pipeline);

        // Fetch category names if category is ObjectId
        await Order.populate(salesData, { path: "category", model: "Category", select: "name" });
        await Order.populate(salesData, { path: "subCategory", model: "Category", select: "name" });

        return handleResponse(res, 200, "Product sales report generated successfully", salesData);
    } catch (error) {
        console.error("Error in getProductSales:", error);
        return handleResponse(res, 500, "Failed to generate report", error.message);
    }
};
