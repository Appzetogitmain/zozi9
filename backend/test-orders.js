import mongoose from "mongoose";
import dotenv from "dotenv";
import Order from "./app/models/order.js";

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const delivered = await Order.countDocuments({ status: "delivered" });
  const pending = await Order.countDocuments({ status: { $in: ["pending", "confirmed", "packed", "out_for_delivery"] } });
  
  const allStatuses = await Order.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);
  
  console.log("Delivered count:", delivered);
  console.log("Pending count:", pending);
  console.log("All statuses:", JSON.stringify(allStatuses, null, 2));
  
  process.exit(0);
}

run();
