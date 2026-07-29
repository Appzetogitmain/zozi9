import mongoose from "mongoose";
import dotenv from "dotenv";
import LoginHistory from "./app/models/loginHistory.js";
import Seller from "./app/models/seller.js";
import Delivery from "./app/models/delivery.js";

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const docs = await LoginHistory.find({}).populate("userId").lean();
  console.log("Populated Docs:", JSON.stringify(docs, null, 2));
  process.exit(0);
}

run();
