import mongoose from "mongoose";
import dotenv from "dotenv";
import LoginHistory from "./app/models/loginHistory.js";

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const docs = await LoginHistory.find({}).lean();
  console.log("Total LoginHistory Docs:", docs.length);
  console.log("Docs:", JSON.stringify(docs, null, 2));
  process.exit(0);
}

run();
