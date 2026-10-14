/**
 * Spin & Win reporting. Every number comes from real collections
 * (impressions, attempts, customer rewards, ledger and orders) - nothing is mocked.
 */
import mongoose from "mongoose";
import SpinAttempt from "../../models/spinAttempt.js";
import SpinImpression from "../../models/spinImpression.js";
import SpinReward from "../../models/spinReward.js";
import CustomerReward from "../../models/customerReward.js";
import RewardLedger from "../../models/rewardLedger.js";
import Order from "../../models/order.js";
import { round2 } from "./spinLogic.js";

const oid = (v) => new mongoose.Types.ObjectId(String(v));

function dateRange(from, to) {
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return Object.keys(range).length ? range : null;
}

export async function buildSpinReport({ campaignId = null, from = null, to = null } = {}) {
  const created = dateRange(from, to);
  const campaignMatch = campaignId ? { campaignId: oid(campaignId) } : {};
  const timeMatch = created ? { createdAt: created } : {};
  const now = new Date();

  const impressionMatch = { ...campaignMatch, ...timeMatch };
  const attemptMatch = { ...campaignMatch, ...timeMatch };
  const rewardMatch = { ...campaignMatch, ...timeMatch };
  const ledgerMatch = { ...campaignMatch, ...timeMatch };

  const [
    impressionTotals,
    attemptTotals,
    attemptsByReward,
    attemptsByDay,
    rewardStatusCounts,
    expiredLazy,
    ledgerTotals,
    orderTotals,
    rewardDefs,
    redeemedByReward,
  ] = await Promise.all([
    SpinImpression.aggregate([
      { $match: impressionMatch },
      { $group: { _id: null, impressions: { $sum: 1 }, viewers: { $addToSet: "$viewerKey" } } },
      { $project: { _id: 0, impressions: 1, uniqueViewers: { $size: "$viewers" } } },
    ]),
    SpinAttempt.aggregate([
      { $match: attemptMatch },
      {
        $group: {
          _id: null,
          spins: { $sum: 1 },
          participants: { $addToSet: "$customerId" },
          noPrize: { $sum: { $cond: [{ $eq: ["$outcome", "no_prize"] }, 1, 0] } },
        },
      },
      { $project: { _id: 0, spins: 1, noPrize: 1, uniqueParticipants: { $size: "$participants" } } },
    ]),
    SpinAttempt.aggregate([
      { $match: { ...attemptMatch } },
      { $group: { _id: "$rewardId", wins: { $sum: 1 } } },
    ]),
    SpinAttempt.aggregate([
      { $match: attemptMatch },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "+05:30" } },
          spins: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    CustomerReward.aggregate([{ $match: rewardMatch }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    // "available" rewards whose expiry date has passed but were not yet swept
    CustomerReward.countDocuments({ ...rewardMatch, status: "available", expiresAt: { $lte: now } }),
    RewardLedger.aggregate([
      { $match: ledgerMatch },
      { $group: { _id: { type: "$entryType", fundedBy: "$fundedBy" }, amount: { $sum: "$amount" }, n: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { spinRewardId: { $exists: true, $ne: null }, status: { $ne: "cancelled" }, ...timeMatch } },
      {
        $lookup: {
          from: CustomerReward.collection.name,
          localField: "spinRewardId",
          foreignField: "_id",
          as: "reward",
        },
      },
      { $unwind: "$reward" },
      ...(campaignId ? [{ $match: { "reward.campaignId": oid(campaignId) } }] : []),
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
          discount: { $sum: { $ifNull: ["$spinRewardDiscount", 0] } },
        },
      },
    ]),
    SpinReward.find(campaignId ? { campaignId: oid(campaignId) } : {})
      .select("label type value campaignId totalQuantity awardedCount isActive")
      .lean(),
    CustomerReward.aggregate([
      { $match: { ...rewardMatch, status: "redeemed" } },
      { $group: { _id: "$rewardId", redeemed: { $sum: 1 }, discount: { $sum: "$discountApplied" } } },
    ]),
  ]);

  const imp = impressionTotals[0] || { impressions: 0, uniqueViewers: 0 };
  const att = attemptTotals[0] || { spins: 0, noPrize: 0, uniqueParticipants: 0 };

  const statusMap = Object.fromEntries(rewardStatusCounts.map((r) => [r._id, r.n]));
  const issued = Object.values(statusMap).reduce((a, b) => a + b, 0);
  const redeemed = statusMap.redeemed || 0;
  // a reward is expired if it was swept to "expired" or is available past its expiry
  const expired = (statusMap.expired || 0) + expiredLazy;
  const available = Math.max(0, (statusMap.available || 0) - expiredLazy);

  const ledger = (type, fundedBy) =>
    ledgerTotals
      .filter((row) => row._id.type === type && (!fundedBy || row._id.fundedBy === fundedBy))
      .reduce((sum, row) => sum + row.amount, 0);

  const redeemedAmount = ledger("redeemed");
  const restoredAmount = ledger("restored");
  const cashback = ledger("cashback_credited");
  const companyDiscount = round2(ledger("redeemed", "company") - ledger("restored", "company"));
  const sellerDiscount = round2(ledger("redeemed", "seller") - ledger("restored", "seller"));
  const netDiscount = round2(redeemedAmount - restoredAmount);
  const totalCost = round2(netDiscount + cashback);

  const orderRow = orderTotals[0] || { orders: 0, revenue: 0, discount: 0 };

  const winsByReward = new Map(attemptsByReward.map((r) => [String(r._id), r.wins]));
  const redeemedMap = new Map(redeemedByReward.map((r) => [String(r._id), r]));

  const byReward = rewardDefs.map((reward) => {
    const key = String(reward._id);
    const wins = winsByReward.get(key) || 0;
    const red = redeemedMap.get(key);
    return {
      rewardId: key,
      label: reward.label,
      type: reward.type,
      value: reward.value,
      wins,
      share: att.spins ? round2((wins / att.spins) * 100) : 0,
      redeemed: red?.redeemed || 0,
      discountGiven: round2(red?.discount || 0),
      remaining:
        reward.totalQuantity == null ? null : Math.max(0, reward.totalQuantity - (reward.awardedCount || 0)),
      isActive: reward.isActive,
    };
  });

  return {
    range: { from: from || null, to: to || null, campaignId: campaignId || null },
    funnel: {
      impressions: imp.impressions,
      uniqueViewers: imp.uniqueViewers,
      spins: att.spins,
      uniqueParticipants: att.uniqueParticipants,
      rewardsWon: issued,
      noPrize: att.noPrize,
    },
    coupons: { issued, available, redeemed, expired },
    attribution: {
      orders: orderRow.orders,
      revenue: round2(orderRow.revenue),
      discountOnOrders: round2(orderRow.discount),
      averageOrderValue: orderRow.orders ? round2(orderRow.revenue / orderRow.orders) : 0,
    },
    cost: {
      companyFundedDiscount: companyDiscount,
      sellerFundedDiscount: sellerDiscount,
      walletCashback: round2(cashback),
      totalCampaignCost: totalCost,
      costPerOrder: orderRow.orders ? round2(totalCost / orderRow.orders) : 0,
    },
    conversion: {
      participationRate: imp.uniqueViewers ? round2((att.uniqueParticipants / imp.uniqueViewers) * 100) : 0,
      redemptionRate: issued ? round2((redeemed / issued) * 100) : 0,
      revenuePerRupeeOfCost: totalCost > 0 ? round2(orderRow.revenue / totalCost) : null,
    },
    byReward,
    spinsByDay: attemptsByDay.map((d) => ({ date: d._id, spins: d.spins })),
  };
}

export default { buildSpinReport };
