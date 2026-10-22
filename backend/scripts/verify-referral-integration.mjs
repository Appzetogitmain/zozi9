/**
 * Integration check for Refer & Earn against a REAL MongoDB (transactions need a replica set).
 *
 * It never touches your real data: it connects to a throw-away database named
 * `referral_verify_<timestamp>` on the same cluster and DROPS it when finished.
 *
 *   node scripts/verify-referral-integration.mjs
 */
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("MONGO_URI is not set");
  process.exit(1);
}
const dbName = `referral_verify_${Date.now()}`;

let passed = 0;
let failed = 0;
const check = (name, condition, extra = "") => {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name} ${extra}`);
  }
};
const expectReject = async (promise) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
};

await mongoose.connect(uri, { dbName });
console.log(`Connected. Using temporary database: ${dbName}\n`);

const { default: User } = await import("../app/models/customer.js");
const { default: Order } = await import("../app/models/order.js");
const { default: Transaction } = await import("../app/models/transaction.js");
const { default: CustomerReward } = await import("../app/models/customerReward.js");
const { default: RewardLedger } = await import("../app/models/rewardLedger.js");
const { default: Referral } = await import("../app/models/referral.js");
const { default: ReferralSettings } = await import("../app/models/referralSettings.js");
const { default: SpinSettings } = await import("../app/models/spinSettings.js");
const referral = await import("../app/services/referralService.js");
const redemption = await import("../app/services/spin/spinRedemption.js");

try {
  // collections + indexes must exist before running transactions
  for (const model of [User, Order, Transaction, CustomerReward, RewardLedger, Referral, ReferralSettings, SpinSettings]) {
    await model.createCollection().catch(() => {});
    await model.syncIndexes();
  }

  const mkUser = (name, phone) => User.create({ name, phone, isVerified: true });
  const mkOrder = async (customer, subtotal, extra = {}) => {
    const _id = new mongoose.Types.ObjectId();
    await Order.collection.insertOne({
      _id,
      orderId: `ORD-${_id.toString().slice(-6)}`,
      customer,
      status: "delivered",
      pricing: { subtotal, total: subtotal },
      ...extra,
    });
    return Order.findById(_id).lean();
  };

  const alice = await mkUser("Alice Sharma", "+919000000001");
  const bob = await mkUser("Bob", "+919000000002");
  const carol = await mkUser("Carol", "+919000000003");
  const dave = await mkUser("Dave", "+919000000004");

  console.log("Codes");
  const code = await referral.ensureReferralCode(alice._id);
  check("referral code is created", /^[A-Z2-9]{8}$/.test(code), code);
  check("same code on second call", (await referral.ensureReferralCode(alice._id)) === code);

  console.log("\nApplying codes");
  let err = await expectReject(referral.applyReferralCode({ customerId: bob._id, code }));
  check("rejected while programme is disabled", err?.code === "DISABLED", err?.message);

  await ReferralSettings.updateOne(
    { key: "default" },
    {
      $set: {
        enabled: true,
        referrerReward: { type: "wallet", value: 50, minCartValue: 0, validityDays: 30 },
        refereeReward: { type: "percentage", value: 10, maxDiscount: 100, minCartValue: 0, validityDays: 30 },
        minOrderValue: 200,
        maxReferralsPerUser: 1,
      },
    },
    { upsert: true },
  );

  err = await expectReject(referral.applyReferralCode({ customerId: alice._id, code }));
  check("own code is rejected", err?.code === "SELF_REFERRAL", err?.message);
  err = await expectReject(referral.applyReferralCode({ customerId: bob._id, code: "NOPE1234" }));
  check("unknown code is rejected", err?.code === "INVALID_CODE", err?.message);

  const applied = await referral.applyReferralCode({ customerId: bob._id, code: code.toLowerCase() });
  check("friend can apply code (case-insensitive)", applied.applied === true);
  check("referredBy is set", String((await User.findById(bob._id).lean()).referredBy) === String(alice._id));
  err = await expectReject(referral.applyReferralCode({ customerId: bob._id, code }));
  check("second code is rejected", err?.code === "ALREADY_REFERRED", err?.message);

  await mkOrder(carol._id, 500);
  err = await expectReject(referral.applyReferralCode({ customerId: carol._id, code }));
  check("customer with an order cannot apply", err?.code === "HAS_ORDERS", err?.message);

  console.log("\nRewards on delivery");
  const small = await mkOrder(bob._id, 150);
  let result = await referral.processDeliveredOrderForReferral(small);
  check("order below minimum does not qualify", result.reason === "below_min_order_value", JSON.stringify(result));

  const big = await mkOrder(bob._id, 250);
  result = await referral.processDeliveredOrderForReferral(big._id);
  check("qualifying order completes the referral", result.completed === true, JSON.stringify(result));

  const aliceAfter = await User.findById(alice._id).lean();
  check("sharer got ₹50 wallet cash", aliceAfter.walletBalance === 50, String(aliceAfter.walletBalance));
  const bonus = await Transaction.findOne({ user: alice._id, type: "Bonus" }).lean();
  check("wallet credit has a Bonus transaction", bonus?.amount === 50 && bonus?.meta?.source === "referral");

  const bobReward = await CustomerReward.findOne({ customerId: bob._id, source: "referral" }).lean();
  check("friend got a 10% coupon", bobReward?.snapshot?.type === "percentage" && bobReward?.snapshot?.value === 10);
  check("coupon is available", bobReward?.status === "available");
  check("coupon issue is in the ledger", !!(await RewardLedger.findOne({ customerRewardId: bobReward?._id, entryType: "issued", source: "referral" })));

  result = await referral.processDeliveredOrderForReferral(big._id);
  check("processing again is a no-op", result.completed === false);
  check("no double wallet credit", (await User.findById(alice._id).lean()).walletBalance === 50);

  console.log("\nUsing the coupon at checkout");
  await SpinSettings.updateOne({ key: "default" }, { $set: { enabled: false, allowRedemptionWhenDisabled: false } }, { upsert: true });
  const snapshot = await redemption.loadRewardForCheckout({ customerId: bob._id, rewardId: bobReward._id });
  check("coupon loads even when Spin & Win is off", snapshot?.type === "percentage");

  const nextOrder = await mkOrder(bob._id, 300, { status: "pending" });
  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    await redemption.claimRewardForOrder({
      rewardId: bobReward._id,
      customerId: bob._id,
      order: nextOrder,
      checkoutGroupId: "",
      discountApplied: 30,
      session,
    });
  });
  session.endSession();
  check("coupon can be redeemed", (await CustomerReward.findById(bobReward._id).lean()).status === "redeemed");

  await Order.updateOne({ _id: nextOrder._id }, { $set: { status: "cancelled", spinRewardId: bobReward._id } });
  const restored = await redemption.restoreRewardForOrder({ ...nextOrder, status: "cancelled", spinRewardId: bobReward._id });
  check("coupon comes back after cancellation", restored.restored === true, JSON.stringify(restored));

  console.log("\nLimit per sharer");
  await referral.applyReferralCode({ customerId: dave._id, code });
  const daveOrder = await mkOrder(dave._id, 400);
  result = await referral.processDeliveredOrderForReferral(daveOrder);
  const daveReferral = await Referral.findOne({ referee: dave._id }).lean();
  check("referral completes", result.completed === true);
  check("sharer skipped after limit", daveReferral?.referrerReward?.outcome === "skipped_limit");
  check("friend still rewarded", daveReferral?.refereeReward?.outcome === "issued");
  check("sharer wallet unchanged", (await User.findById(alice._id).lean()).walletBalance === 50);

  console.log("\nViews");
  const summary = await referral.getMyReferralSummary(alice._id);
  check("summary counts", summary.stats.total === 2 && summary.stats.completed === 2 && summary.stats.walletEarned === 50, JSON.stringify(summary.stats));
  check("summary masks phone", summary.referrals.every((r) => r.friendPhone.startsWith("•")));
  const bobSummary = await referral.getMyReferralSummary(bob._id);
  check("referred customer cannot apply again", bobSummary.canApplyCode === false && bobSummary.referredBy === true);

  const adminList = await referral.listReferralsForAdmin({ status: "all", search: "", page: 1, limit: 20 });
  check("admin list", adminList.total === 2 && adminList.stats.walletPaid === 50 && adminList.stats.couponsIssued === 2, JSON.stringify(adminList.stats));
  const searched = await referral.listReferralsForAdmin({ status: "all", search: "Dave", page: 1, limit: 20 });
  check("admin search by name", searched.total === 1);
} catch (error) {
  failed += 1;
  console.error("\nUnexpected error:", error);
} finally {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
  console.log(`\nDropped ${dbName}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
