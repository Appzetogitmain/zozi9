/**
 * Drops leftover throw-away databases created by verify-spin-integration.mjs
 * (only databases whose name starts with "spin_verify_").
 */
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();
await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 30000 });
const { databases } = await mongoose.connection.getClient().db().admin().listDatabases();
const leftovers = databases.map((d) => d.name).filter((name) => name.startsWith("spin_verify_"));
for (const name of leftovers) {
  await mongoose.connection.getClient().db(name).dropDatabase();
  console.log("dropped", name);
}
console.log(leftovers.length ? `Removed ${leftovers.length} leftover database(s)` : "No leftover databases");
await mongoose.disconnect();
