/**
 * Adds the starting job openings to the Careers page. Safe to run more than once:
 * a job whose title already exists is left untouched (admins edit them in Admin > Careers).
 *
 *   node scripts/seed-careers.mjs
 */
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const LOCATION = process.env.CAREERS_DEFAULT_LOCATION || "Samba, Jammu & Kashmir";

const JOBS = [
  {
    title: "Delivery Partner",
    description: "Deliver customer orders quickly and safely, and be the friendly face of Zozi9 at every doorstep.",
    responsibilities: [
      "Deliver customer orders on time",
      "Pick up orders from assigned stores",
      "Maintain professional behaviour with customers",
    ],
    requirements: [
      "Valid driving licence where applicable",
      "Suitable vehicle where required",
      "A smartphone",
    ],
    employmentType: "flexible",
    sortOrder: 1,
  },
  {
    title: "Store Manager",
    description: "Lead a Zozi9 store and keep orders, stock and the team running smoothly every day.",
    responsibilities: [
      "Manage daily store operations",
      "Handle inventory, orders and staff coordination",
      "Ensure customer satisfaction and smooth store operations",
    ],
    requirements: [
      "Relevant experience preferred",
      "Good communication skills",
      "Basic computer knowledge",
    ],
    employmentType: "full_time",
    sortOrder: 2,
  },
  {
    title: "Store Helper",
    description: "Help pack and prepare customer orders and keep the store clean and well organised.",
    responsibilities: [
      "Assist with packing and preparing customer orders",
      "Help maintain store cleanliness and product organisation",
      "Support the store manager with daily operations",
    ],
    requirements: ["Basic communication skills", "Willingness to work in a team"],
    employmentType: "full_time",
    sortOrder: 3,
  },
];

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set");
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);
const { default: JobOpening } = await import("../app/models/jobOpening.js");

for (const job of JOBS) {
  const exists = await JobOpening.exists({ title: new RegExp(`^${job.title}$`, "i") });
  if (exists) {
    console.log(`skip    ${job.title} (already exists)`);
    continue;
  }
  await JobOpening.create({ ...job, location: LOCATION, isActive: true });
  console.log(`created ${job.title} - ${LOCATION}`);
}

await mongoose.disconnect();
