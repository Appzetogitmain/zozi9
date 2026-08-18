import mongoose from "mongoose";
import dotenv from "dotenv";
import Order from "./app/models/order.js";

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const pipeline = [
      { $match: { status: "delivered" } },
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
      { $sort: { totalQuantity: -1 } }
  ];

  const salesData = await Order.aggregate(pipeline);
  console.log("Sales Data:", JSON.stringify(salesData, null, 2));
  process.exit(0);
}

run();
