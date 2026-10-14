/**
 * Integration check for Spin & Win against a REAL MongoDB (transactions need a replica set).
 *
 * It never touches your real data: it connects to a throw-away database named
 * `spin_verify_<timestamp>` on the same cluster and DROPS it when finished.
 *
 *   node scripts/verify-spin-integration.mjs
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import crypto from "node:crypto";

dotenv.config();

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("MONGO_URI is not set");
  process.exit(1);
}
const dbName = `spin_verify_${Date.now()}`;

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

const { default: SpinSettings } = await import("../app/models/spinSettings.js");
const { default: SpinCampaign } = await import("../app/models/spinCampaign.js");
const { default: SpinReward } = await import("../app/models/spinReward.js");
const { default: SpinAttempt } = await import("../app/models/spinAttempt.js");
const { default: SpinParticipation } = await import("../app/models/spinParticipation.js");
const { default: CustomerReward } = await import("../app/models/customerReward.js");
const { default: RewardLedger } = await import("../app/models/rewardLedger.js");
const { default: User } = await import("../app/models/customer.js");
const { default: Transaction } = await import("../app/models/transaction.js");
const { default: Order } = await import("../app/models/order.js");
const { default: SpinImpression } = await import("../app/models/spinImpression.js");
const spin = await import("../app/services/spin/spinService.js");
const redemption = await import("../app/services/spin/spinRedemption.js");
const { buildSpinReport } = await import("../app/services/spin/spinReportService.js");

// collections + indexes must exist before running transactions
for (const model of [SpinSettings, SpinCampaign, SpinReward, SpinAttempt, SpinParticipation, CustomerReward, RewardLedger, User, Transaction, Order, SpinImpression]) {
  await model.createCollection().catch(() => {});
  await model.syncIndexes();
}

const DAY = 24 * 60 * 60 * 1000;
let phoneSeq = 9000000000;
const newCustomer = async () =>
  User.create({ name: "Spin Tester", phone: String(phoneSeq++), role: "user", walletBalance: 0 });
const key = () => crypto.randomUUID();

async function newCampaign({ maxSpins = 1, period = "campaign", rewards }) {
  const campaign = await SpinCampaign.create({
    name: `verify-${crypto.randomUUID().slice(0, 6)}`,
    status: "active",
    startAt: new Date(Date.now() - DAY),
    endAt: new Date(Date.now() + DAY),
    participation: { maxSpins, period },
    rewardValidityDays: 7,
  });
  const docs = await SpinReward.insertMany(rewards.map((r, i) => ({ campaignId: campaign._id, sortOrder: i, ...r })));
  return { campaign, rewards: docs };
}

try {
  await SpinSettings.create({ key: "default", enabled: true, popupEnabled: true });

  /* ---------- 1. parallel spins cannot exceed the participation limit ---------- */
  console.log("1) Participation limit under concurrency");
  {
    const { campaign } = await newCampaign({
      maxSpins: 1,
      rewards: [
        { label: "₹20", type: "fixed", value: 20, weight: 1 },
        { label: "Luck", type: "no_prize", weight: 1 },
      ],
    });
    const customer = await newCustomer();
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => spin.playSpin({ customerId: customer._id, idempotencyKey: key() })),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const limited = results.filter((r) => r.status === "rejected" && r.reason?.statusCode === 429);
    check("exactly one of 12 parallel spins succeeds", ok.length === 1, `(got ${ok.length})`);
    check("the other 11 are rejected with 429", limited.length === 11, `(got ${limited.length})`);
    check("one SpinAttempt stored", (await SpinAttempt.countDocuments({ campaignId: campaign._id })) === 1);
    const row = await SpinParticipation.findOne({ campaignId: campaign._id, customerId: customer._id });
    check("participation counter is exactly 1", row?.count === 1, `(got ${row?.count})`);
    const unexpected = results.filter((r) => r.status === "rejected" && r.reason?.statusCode !== 429);
    check("no unexpected errors", unexpected.length === 0, unexpected.map((u) => u.reason?.message).join("; "));
  }

  /* ---------- 2. same Idempotency-Key => same reward, issued once ---------- */
  console.log("\n2) Idempotent retries");
  {
    const { campaign } = await newCampaign({
      maxSpins: 5,
      rewards: [
        { label: "₹20", type: "fixed", value: 20, weight: 1, validityDays: 3 },
        { label: "10%", type: "percentage", value: 10, weight: 1 },
        { label: "Luck", type: "no_prize", weight: 1 },
      ],
    });
    const customer = await newCustomer();
    const sameKey = key();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => spin.playSpin({ customerId: customer._id, idempotencyKey: sameKey })),
    );
    const ids = new Set(results.map((r) => r.attemptId));
    check("all 6 retries return the same attempt", ids.size === 1);
    check("one attempt row", (await SpinAttempt.countDocuments({ customerId: customer._id })) === 1);
    check("at most one reward row", (await CustomerReward.countDocuments({ customerId: customer._id })) <= 1);
    const row = await SpinParticipation.findOne({ campaignId: campaign._id, customerId: customer._id });
    check("only one spin consumed", row?.count === 1, `(got ${row?.count})`);
    const missingKey = await expectReject(spin.playSpin({ customerId: customer._id, idempotencyKey: "" }));
    check("missing idempotency key is rejected (400)", missingKey?.statusCode === 400);
  }

  /* ---------- 3. inventory can never be oversold ---------- */
  console.log("\n3) Reward inventory under concurrency");
  {
    const { campaign, rewards } = await newCampaign({
      maxSpins: 1,
      rewards: [
        { label: "Rare ₹50", type: "fixed", value: 50, weight: 1000, totalQuantity: 3 },
        { label: "Luck", type: "no_prize", weight: 1 },
      ],
    });
    const customers = await Promise.all(Array.from({ length: 25 }, newCustomer));
    const results = await Promise.allSettled(
      customers.map((c) => spin.playSpin({ customerId: c._id, idempotencyKey: key() })),
    );
    const failures = results.filter((r) => r.status === "rejected");
    check("all 25 spins complete", failures.length === 0, failures.map((f) => f.reason?.message).slice(0, 3).join("; "));
    const rare = await SpinReward.findById(rewards[0]._id).lean();
    const issued = await CustomerReward.countDocuments({ rewardId: rewards[0]._id });
    check("awardedCount never exceeds totalQuantity (3)", rare.awardedCount <= 3, `(got ${rare.awardedCount})`);
    check("issued coupons match awardedCount", issued === rare.awardedCount, `(issued ${issued}, awarded ${rare.awardedCount})`);
    check("rare reward is fully used up", rare.awardedCount === 3, `(got ${rare.awardedCount})`);
    const noPrize = results.filter((r) => r.status === "fulfilled" && r.value.outcome === "no_prize").length;
    check("remaining customers get the safe no-prize outcome", noPrize === 22, `(got ${noPrize})`);
    check("25 attempts stored", (await SpinAttempt.countDocuments({ campaignId: campaign._id })) === 25);
  }

  /* ---------- 4. per-customer limit + cashback ---------- */
  console.log("\n4) Per-customer reward limit and wallet cashback");
  {
    const { rewards } = await newCampaign({
      maxSpins: 4,
      rewards: [
        { label: "Once only", type: "fixed", value: 10, weight: 1000, perCustomerLimit: 1 },
        { label: "Luck", type: "no_prize", weight: 1 },
      ],
    });
    const customer = await newCustomer();
    for (let i = 0; i < 4; i += 1) await spin.playSpin({ customerId: customer._id, idempotencyKey: key() });
    const won = await CustomerReward.countDocuments({ customerId: customer._id, rewardId: rewards[0]._id });
    check("perCustomerLimit=1 respected across 4 spins", won === 1, `(got ${won})`);

    await newCampaignDisable();
    const cash = await newCampaign({
      maxSpins: 1,
      rewards: [
        { label: "Cashback ₹15", type: "wallet_cashback", value: 15, weight: 1000 },
        { label: "Luck", type: "no_prize", weight: 1 },
      ],
    });
    const c2 = await newCustomer();
    const res = await spin.playSpin({ customerId: c2._id, idempotencyKey: key() });
    const fresh = await User.findById(c2._id).lean();
    check("cashback outcome returned", res.slice?.type === "wallet_cashback" || res.reward?.type === "wallet_cashback");
    check("wallet credited exactly once", fresh.walletBalance === 15, `(got ${fresh.walletBalance})`);
    check("wallet transaction recorded", (await Transaction.countDocuments({ user: c2._id, type: "Bonus" })) === 1);
    check("cashback reward is marked redeemed immediately", (await CustomerReward.findOne({ customerId: c2._id })).status === "redeemed");
    void cash;
  }

  /* ---------- 5. redemption: ownership, single use, restore ---------- */
  console.log("\n5) Redemption, ownership, restore");
  {
    await newCampaignDisable();
    await newCampaign({
      maxSpins: 1,
      rewards: [
        { label: "₹40", type: "fixed", value: 40, weight: 1000, minCartValue: 100 },
        { label: "Luck", type: "no_prize", weight: 1 },
      ],
    });
    const owner = await newCustomer();
    const other = await newCustomer();
    const res = await spin.playSpin({ customerId: owner._id, idempotencyKey: key() });
    const rewardId = res.reward?.id;
    check("a coupon was issued", !!rewardId);

    const stranger = await expectReject(redemption.loadRewardForCheckout({ customerId: other._id, rewardId }));
    check("another customer cannot use or see the reward (404)", stranger?.statusCode === 404);

    const mine = await redemption.loadRewardForCheckout({ customerId: owner._id, rewardId });
    check("owner can load it", String(mine._id) === String(rewardId));

    const orderStub = (n) => ({ _id: new mongoose.Types.ObjectId(), orderId: `ORD-TEST-${n}` });
    const claims = await Promise.allSettled(
      Array.from({ length: 6 }, async (_, n) => {
        const session = await mongoose.startSession();
        try {
          let out;
          await session.withTransaction(async () => {
            out = await redemption.claimRewardForOrder({
              rewardId,
              customerId: owner._id,
              order: orderStub(n),
              checkoutGroupId: `CG-${n}`,
              discountApplied: 40,
              session,
            });
          });
          return out;
        } finally {
          await session.endSession();
        }
      }),
    );
    const wins = claims.filter((c) => c.status === "fulfilled").length;
    check("6 parallel orders: exactly ONE redeems the reward", wins === 1, `(got ${wins})`);
    const after = await CustomerReward.findById(rewardId).lean();
    check("reward is marked redeemed with the discount", after.status === "redeemed" && after.discountApplied === 40);
    const reuse = await expectReject(redemption.loadRewardForCheckout({ customerId: owner._id, rewardId }));
    check("a used reward cannot be loaded again (409)", reuse?.statusCode === 409);

    const stub = { _id: after.orderId, spinRewardId: rewardId };
    const restored = await redemption.restoreRewardForOrder(stub, { reason: "cancelled" });
    check("cancel restores the reward", restored.restored === true && restored.status === "available");
    const again = await redemption.restoreRewardForOrder(stub, { reason: "cancelled" });
    check("restoring twice is harmless", again.restored === false);
    const back = await CustomerReward.findById(rewardId).lean();
    check("reward is available again and cleared of order links", back.status === "available" && !back.orderId && back.restoredCount === 1);

    await SpinSettings.updateOne({ key: "default" }, { $set: { restoreOnCancel: false } });
    await CustomerReward.updateOne({ _id: rewardId }, { $set: { status: "redeemed", orderId: stub._id } });
    const policy = await redemption.restoreRewardForOrder(stub, { reason: "cancelled" });
    check("restoreOnCancel=false is honoured", policy.restored === false && policy.reason === "policy");
    await SpinSettings.updateOne({ key: "default" }, { $set: { restoreOnCancel: true } });

    await CustomerReward.updateOne({ _id: rewardId }, { $set: { status: "available", expiresAt: new Date(Date.now() - 1000) } });
    const expired = await expectReject(redemption.loadRewardForCheckout({ customerId: owner._id, rewardId }));
    check("an expired reward is rejected (410)", expired?.statusCode === 410);
    const list = await spin.listMyRewards({ customerId: owner._id, status: "expired" });
    check("expired reward is listed as expired", list.items.length === 1 && list.counts.expired === 1);
  }

  /* ---------- 6. global switch ---------- */
  console.log("\n6) Global enable / disable");
  {
    await newCampaignDisable();
    const { rewards } = await newCampaign({
      maxSpins: 2,
      rewards: [
        { label: "₹5", type: "fixed", value: 5, weight: 1000 },
        { label: "Luck", type: "no_prize", weight: 1 },
      ],
    });
    const customer = await newCustomer();
    const first = await spin.playSpin({ customerId: customer._id, idempotencyKey: key() });
    await SpinSettings.updateOne({ key: "default" }, { $set: { enabled: false } });
    const blocked = await expectReject(spin.playSpin({ customerId: customer._id, idempotencyKey: key() }));
    check("no new spins when disabled (403)", blocked?.statusCode === 403);
    const active = await spin.getActiveCampaignForCustomer({ customerId: customer._id });
    check("campaign is hidden when disabled", active.active === false);
    if (first.reward?.id) {
      const stillOk = await redemption.loadRewardForCheckout({ customerId: customer._id, rewardId: first.reward.id }).catch((e) => e);
      check("issued rewards stay redeemable (policy)", !(stillOk instanceof Error));
      await SpinSettings.updateOne({ key: "default" }, { $set: { allowRedemptionWhenDisabled: false } });
      const denied = await redemption.loadRewardForCheckout({ customerId: customer._id, rewardId: first.reward.id }).catch((e) => e);
      check("...unless the admin disallows it", denied?.statusCode === 403);
      await SpinSettings.updateOne({ key: "default" }, { $set: { allowRedemptionWhenDisabled: true } });
    }
    await SpinSettings.updateOne({ key: "default" }, { $set: { enabled: true } });
    void rewards;
  }

  /* ---------- 7. public payload + reports ---------- */
  console.log("\n7) Public payload privacy and reports");
  {
    await newCampaignDisable();
    const { campaign } = await newCampaign({
      maxSpins: 3,
      rewards: [
        { label: "₹30", type: "fixed", value: 30, weight: 7, totalQuantity: 99 },
        { label: "Luck", type: "no_prize", weight: 3 },
      ],
    });
    const customer = await newCustomer();
    const payload = await spin.getActiveCampaignForCustomer({ customerId: customer._id });
    const text = JSON.stringify(payload);
    check("public payload hides weights and stock", !/"weight"|totalQuantity|awardedCount|perCustomerLimit/.test(text));
    check("eligibility says canSpin", payload.eligibility.canSpin === true && payload.eligibility.remainingSpins === 3);

    await spin.recordImpression({ campaignId: campaign._id, customerId: customer._id });
    await spin.recordImpression({ campaignId: campaign._id, viewerKey: "guest-1" });
    await spin.playSpin({ customerId: customer._id, idempotencyKey: key() });
    await spin.playSpin({ customerId: customer._id, idempotencyKey: key() });

    const report = await buildSpinReport({ campaignId: String(campaign._id) });
    check("report: impressions = 2, unique viewers = 2", report.funnel.impressions === 2 && report.funnel.uniqueViewers === 2);
    check("report: 2 spins by 1 participant", report.funnel.spins === 2 && report.funnel.uniqueParticipants === 1);
    check("report: reward-wise wins add up to spins", report.byReward.reduce((s, r) => s + r.wins, 0) === 2);
    check("report: coupons issued matches stored rewards", report.coupons.issued === (await CustomerReward.countDocuments({ campaignId: campaign._id })));

    const guest = await spin.getActiveCampaignForCustomer({ customerId: null });
    check("guest sees eligibility = login_required", guest.eligibility.reason === "login_required");
  }

  /* ---------- 8. checkout pricing: server-side discount, payouts untouched ---------- */
  console.log("\n8) Checkout pricing with a reward (real pricing engine)");
  {
    const { buildCheckoutPricingSnapshot } = await import("../app/services/checkoutPricingService.js");
    const oid = () => new mongoose.Types.ObjectId();
    const header = oid();
    const [s1, s2] = [oid(), oid()];
    const [p1, p2] = [oid(), oid()];
    await mongoose.connection.collection("categories").insertOne({ _id: header, name: "Verify Header" });
    await mongoose.connection.collection("sellers").insertMany([
      { _id: s1, shopName: "Verify Shop 1", email: "v1@verify.test", phone: "7000000001" },
      { _id: s2, shopName: "Verify Shop 2", email: "v2@verify.test", phone: "7000000002" },
    ]);
    await mongoose.connection.collection("products").insertMany([
      { _id: p1, slug: "verify-a", name: "Verify A", price: 200, stock: 50, status: "active", headerId: header, categoryId: header, subcategoryId: header, sellerId: s1 },
      { _id: p2, slug: "verify-b", name: "Verify B", price: 100, stock: 50, status: "active", headerId: header, categoryId: header, subcategoryId: header, sellerId: s2 },
    ]);
    const orderItems = [
      { product: String(p1), quantity: 1, price: 1 }, // client price is ignored by the server
      { product: String(p2), quantity: 2 },
    ];
    const snap = (type, value, extra = {}) => ({ _id: oid(), type, value, ...extra });
    const sum = (rows, f) => Math.round(rows.reduce((a, r) => a + f(r), 0) * 100) / 100;

    const base = await buildCheckoutPricingSnapshot({ orderItems, address: {}, tipAmount: 0, discountTotal: 0 });
    check("baseline subtotal uses server prices (₹400)", base.aggregateBreakdown.productSubtotal === 400);

    const fixed = await buildCheckoutPricingSnapshot({ orderItems, address: {}, spinReward: snap("fixed", 50) });
    check("fixed ₹50: reward outcome applicable", fixed.spinRewardOutcome.applicable && fixed.spinRewardOutcome.discount === 50);
    check("grand total drops by exactly ₹50", Math.abs(base.aggregateBreakdown.grandTotal - fixed.aggregateBreakdown.grandTotal - 50) < 0.011);
    check("discountTotal on the order set is ₹50", fixed.aggregateBreakdown.discountTotal === 50);
    check("seller payouts are NOT reduced (company-funded)", fixed.aggregateBreakdown.sellerPayoutTotal === base.aggregateBreakdown.sellerPayoutTotal);
    check("rider payout is NOT reduced", fixed.aggregateBreakdown.riderPayoutTotal === base.aggregateBreakdown.riderPayoutTotal);
    check("per-seller reward shares add up to exactly ₹50", sum(fixed.sellerBreakdownEntries, (e) => e.rewardDiscount) === 50);
    check("2 seller orders are produced", fixed.sellerCount === 2);

    const pct = await buildCheckoutPricingSnapshot({ orderItems, address: {}, spinReward: snap("percentage", 10, { maxDiscount: 25 }) });
    check("10% (cap ₹25) of ₹400 = ₹25", pct.spinRewardOutcome.discount === 25 && pct.aggregateBreakdown.discountTotal === 25);

    const tooSmall = await buildCheckoutPricingSnapshot({ orderItems, address: {}, spinReward: snap("fixed", 50, { minCartValue: 1000 }) });
    check("minimum cart value not met => not applicable, no discount", !tooSmall.spinRewardOutcome.applicable && tooSmall.aggregateBreakdown.discountTotal === 0);

    const onlyS2 = await buildCheckoutPricingSnapshot({ orderItems, address: {}, spinReward: snap("fixed", 30, { eligibleSellerIds: [s2] }) });
    const s2Entry = onlyS2.sellerBreakdownEntries.find((e) => e.sellerId === String(s2));
    const s1Entry = onlyS2.sellerBreakdownEntries.find((e) => e.sellerId === String(s1));
    check("seller-restricted reward only discounts that seller's order", s2Entry.rewardDiscount === 30 && s1Entry.rewardDiscount === 0);

    const gift = await buildCheckoutPricingSnapshot({ orderItems, address: {}, spinReward: snap("free_product", 0, { freeProductId: p2 }) });
    check("free product = one unit of the gift (₹100) off", gift.spinRewardOutcome.discount === 100);

    const fd = await buildCheckoutPricingSnapshot({ orderItems, address: {}, spinReward: snap("free_delivery", 0) });
    const deliveryFee = base.aggregateBreakdown.deliveryFeeCharged;
    check(
      "free delivery discounts exactly the delivery fee",
      deliveryFee > 0
        ? fd.spinRewardOutcome.applicable && Math.abs(fd.spinRewardOutcome.discount - deliveryFee) < 0.011
        : !fd.spinRewardOutcome.applicable,
      `(fee ${deliveryFee})`,
    );

    const cashback = await buildCheckoutPricingSnapshot({ orderItems, address: {}, spinReward: snap("wallet_cashback", 10) });
    check("cashback rewards are never applied to an order", !cashback.spinRewardOutcome.applicable && cashback.aggregateBreakdown.discountTotal === 0);

    /* ---------- 9. the real order transaction ---------- */
    console.log("\n9) placeOrderAtomic with a reward (real order transaction)");
    const { placeOrderAtomic } = await import("../app/services/orderPlacementService.js");
    // a brand-new database has no collections; create every model's collection up front so the
    // order transaction never has to create one mid-flight (that is what causes WriteConflict)
    for (const name of mongoose.modelNames()) {
      const model = mongoose.model(name);
      await model.createCollection().catch(() => {});
      await model.syncIndexes().catch(() => {});
    }
    await newCampaignDisable();
    await newCampaign({
      maxSpins: 1,
      rewards: [
        { label: "₹50", type: "fixed", value: 50, weight: 1000, minCartValue: 100 },
        { label: "Luck", type: "no_prize", weight: 1 },
      ],
    });
    const buyer = await newCustomer();
    const won = await spin.playSpin({ customerId: buyer._id, idempotencyKey: key() });
    const rewardId = won.reward?.id;
    check("buyer won a coupon to use", !!rewardId);

    const payload = (extra = {}) => ({
      items: [{ product: String(p1), quantity: 1 }, { product: String(p2), quantity: 2 }],
      address: { name: "T", address: "Test street", phone: "9999999999" },
      paymentMode: "ONLINE",
      timeSlot: "now",
      ...extra,
    });

    const tooBig = new mongoose.Types.ObjectId();
    const bad = await expectReject(placeOrderAtomic({ customerId: buyer._id, payload: payload({ spinRewardId: String(tooBig) }) }));
    check("unknown / someone else's reward is rejected (404)", bad?.statusCode === 404, `(${bad?.message})`);
    check("...and no order was created", (await Order.countDocuments({ customer: buyer._id })) === 0);

    const placed = await placeOrderAtomic({ customerId: buyer._id, payload: payload({ spinRewardId: rewardId }) });
    check("order placed with the reward", placed.orders.length === 2, `(orders: ${placed.orders?.length})`);
    const totalDiscount = Math.round(placed.orders.reduce((s, o) => s + (o.spinRewardDiscount || 0), 0) * 100) / 100;
    check("orders carry the reward discount (₹50 in total)", totalDiscount === 50, `(got ${totalDiscount})`);
    check("order totals include the discount", placed.checkoutGroup.pricingSummary.discountTotal === 50);
    const claimed = await CustomerReward.findById(rewardId).lean();
    check("reward is redeemed and linked to the order", claimed.status === "redeemed" && !!claimed.orderId && claimed.discountApplied === 50);
    check("ledger recorded the redemption", (await RewardLedger.countDocuments({ customerRewardId: rewardId, entryType: "redeemed" })) === 1);

    const reuse = await expectReject(placeOrderAtomic({ customerId: buyer._id, payload: payload({ spinRewardId: rewardId }) }));
    check("re-using the reward is rejected (409)", reuse?.statusCode === 409, `(${reuse?.message})`);
    check("...and the rejected attempt left no extra order", (await Order.countDocuments({ customer: buyer._id })) === 2);

    // reward restored when every order of the checkout is cancelled
    await Order.updateMany({ customer: buyer._id }, { $set: { status: "cancelled" } });
    const firstOrder = await Order.findOne({ customer: buyer._id }).lean();
    const back = await redemption.restoreRewardForOrder(firstOrder, { reason: "cancelled" });
    check("cancelling the orders gives the reward back", back.restored === true);

    // a failed order (cart below the reward's minimum value) must not burn the reward
    await CustomerReward.updateOne({ _id: rewardId }, { $set: { "snapshot.minCartValue": 500 } });
    const small = await expectReject(
      placeOrderAtomic({
        customerId: buyer._id,
        payload: { ...payload({ spinRewardId: rewardId }), items: [{ product: String(p2), quantity: 1 }] },
      }),
    );
    check("cart below the reward minimum is rejected (400)", small?.statusCode === 400, `(${small?.message})`);
    check("...and the reward is still available afterwards", (await CustomerReward.findById(rewardId).lean()).status === "available");
  }
} catch (error) {
  failed += 1;
  console.error("\nUnexpected error while verifying:", error);
} finally {
  await mongoose.connection.dropDatabase();
  console.log(`\nDropped temporary database ${dbName}`);
  await mongoose.disconnect();
}

console.log(`\nResult: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

// only one campaign may be live at a time in practice; tests switch the previous one off
async function newCampaignDisable() {
  await SpinCampaign.updateMany({ status: "active" }, { $set: { status: "paused" } });
}
