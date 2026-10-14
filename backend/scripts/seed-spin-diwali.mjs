/**
 * Seeds a ready-to-use "Diwali Dhamaka" Spin & Win campaign that shows every option:
 * all reward types, limits, validity, category / seller / product restrictions and a free gift.
 *
 *   node scripts/seed-spin-diwali.mjs            # creates it (as DRAFT) if it does not exist
 *   node scripts/seed-spin-diwali.mjs --replace  # deletes the previous seeded copy first
 *
 * It never switches the feature on and never activates the campaign:
 * open Admin -> Spin & Win, review it, then press Activate.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const CAMPAIGN_NAME = "Diwali Dhamaka 2026";
const replace = process.argv.includes("--replace");

await mongoose.connect(process.env.MONGO_URI);

const { default: SpinSettings } = await import("../app/models/spinSettings.js");
const { default: SpinCampaign } = await import("../app/models/spinCampaign.js");
const { default: SpinReward } = await import("../app/models/spinReward.js");
const { default: SpinAttempt } = await import("../app/models/spinAttempt.js");
const { default: Product } = await import("../app/models/product.js");
const { default: Category } = await import("../app/models/category.js");
const { validateRewardConfig, validateRewardSet } = await import("../app/services/spin/spinLogic.js");

try {
  const existing = await SpinCampaign.findOne({ name: CAMPAIGN_NAME });
  if (existing) {
    const spins = await SpinAttempt.countDocuments({ campaignId: existing._id });
    if (!replace) {
      console.log(`"${CAMPAIGN_NAME}" already exists (status: ${existing.status}). Nothing changed. Use --replace to rebuild it.`);
      process.exit(0);
    }
    if (spins > 0) {
      console.log(`"${CAMPAIGN_NAME}" already has ${spins} spin(s); refusing to delete it. Edit it in the admin panel instead.`);
      process.exit(1);
    }
    await SpinReward.deleteMany({ campaignId: existing._id });
    await existing.deleteOne();
    console.log("Removed the previous unused seeded campaign.");
  }

  // Real catalogue data for the restricted / gift rewards (skipped gracefully if the store is empty)
  const giftProduct = await Product.findOne({ status: "active", price: { $gt: 0, $lte: 150 } })
    .sort({ price: 1 })
    .select("_id name price sellerId categoryId")
    .lean();
  const category = await Category.findOne({ type: "category" }).select("_id name").lean();

  // Diwali palette (an admin can still change every colour; empty = follow the app theme)
  const rewards = [
    { label: "₹20 OFF", type: "fixed", value: 20, icon: "rupee", color: "#f59e0b", weight: 22, minCartValue: 199, totalQuantity: null, perCustomerLimit: null, validityDays: 7 },
    { label: "₹50 OFF", type: "fixed", value: 50, icon: "fire", color: "#dc2626", weight: 8, minCartValue: 499, totalQuantity: 200, perCustomerLimit: 1, validityDays: 10 },
    { label: "10% OFF", type: "percentage", value: 10, icon: "percent", color: "#7c3aed", weight: 14, minCartValue: 299, maxDiscount: 100, totalQuantity: null, perCustomerLimit: 1, validityDays: 7 },
    { label: "Free Delivery", type: "free_delivery", icon: "truck", color: "#059669", weight: 18, minCartValue: 149, totalQuantity: null, perCustomerLimit: 2, validityDays: 5 },
    { label: "₹25 Cashback", type: "wallet_cashback", value: 25, icon: "wallet", color: "#db2777", weight: 6, totalQuantity: 100, perCustomerLimit: 1 },
    { label: "Better Luck", type: "no_prize", icon: "luck", color: "", weight: 24, totalQuantity: null },
  ];

  if (category) {
    rewards.splice(3, 0, {
      label: `15% OFF ${category.name}`.slice(0, 40),
      type: "percentage",
      value: 15,
      icon: "bag",
      color: "#ea580c",
      weight: 6,
      minCartValue: 249,
      maxDiscount: 150,
      totalQuantity: 150,
      perCustomerLimit: 1,
      validityDays: 7,
      eligibleCategoryIds: [category._id],
    });
  }
  if (giftProduct) {
    rewards.push({
      label: "Free Diwali Gift",
      type: "free_product",
      icon: "gift",
      color: "#be123c",
      weight: 2,
      totalQuantity: 50,
      perCustomerLimit: 1,
      validityDays: 7,
      freeProductId: giftProduct._id,
    });
  }

  // Validate exactly like the admin API does before saving anything
  const problems = rewards.flatMap((r) => validateRewardConfig(r).map((e) => `${r.label}: ${e}`));
  const setProblems = validateRewardSet(rewards);
  if (problems.length || setProblems.length) {
    console.error("Seed data is invalid:", [...problems, ...setProblems]);
    process.exit(1);
  }

  // Diwali 2026 is on 8 November. Dates are stored in UTC; 18:30Z = 00:00 IST.
  const campaign = await SpinCampaign.create({
    name: CAMPAIGN_NAME,
    title: "Diwali Dhamaka Spin & Win",
    description: "Spin the wheel and light up your Diwali with exciting rewards!",
    bannerImage: "",
    status: "draft",
    startAt: new Date("2026-10-31T18:30:00.000Z"), // 1 Nov 2026, 00:00 IST
    endAt: new Date("2026-11-12T18:29:00.000Z"), // 12 Nov 2026, 23:59 IST
    popup: { delaySeconds: 3, frequency: "daily" },
    requireLogin: true,
    eligibility: { audience: "all", minOrders: 1 },
    participation: { maxSpins: 1, period: "day" },
    rewardValidityDays: 7,
    terms: [
      "1. Offer valid from 1 Nov to 12 Nov 2026. Each customer gets 1 spin per day.",
      "2. Rewards are valid only for the number of days shown after winning and can be used on one order only.",
      "3. Minimum order value and maximum discount shown on the reward apply.",
      "4. One reward per order. A reward cannot be combined with another reward.",
      "5. Cashback is credited to your wallet immediately.",
      "6. Rewards are not exchangeable for cash. The company may change or end the offer at any time.",
    ].join("\n"),
    auditLog: [{ at: new Date(), action: "seeded", summary: `Created "${CAMPAIGN_NAME}" with sample rewards (draft)` }],
  });

  await SpinReward.insertMany(rewards.map((r, index) => ({ ...r, campaignId: campaign._id, sortOrder: index })));

  // make sure the master settings row exists (it stays OFF until an admin enables it)
  const settings = await SpinSettings.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  console.log(`\nCreated "${CAMPAIGN_NAME}" (id ${campaign._id}) as DRAFT with ${rewards.length} rewards:`);
  rewards.forEach((r, i) => console.log(`  ${i + 1}. ${r.label.padEnd(26)} ${r.type.padEnd(16)} weight ${r.weight}`));
  if (!category) console.log("  (no category found: the category-restricted reward was skipped)");
  if (!giftProduct) console.log("  (no suitable product found: the free-gift reward was skipped)");
  console.log(`\nMaster switch "Spin & Win is live": ${settings.enabled ? "ON" : "OFF (nothing is visible to customers yet)"}`);
  console.log("Next: Admin -> Marketing Tools -> Spin & Win -> open the campaign -> Activate.");
} finally {
  await mongoose.disconnect();
}
