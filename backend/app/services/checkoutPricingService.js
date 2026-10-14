import Seller from "../models/seller.js";
import Category from "../models/category.js";
import { distanceMeters } from "../utils/geoUtils.js";
import { HANDLING_FEE_STRATEGY } from "../constants/finance.js";
import {
  allocateProportionally,
  computeRewardDiscount,
  itemMatchesReward,
} from "./spin/spinLogic.js";
import {
  calculateHandlingFee,
  generateOrderPaymentBreakdown,
  hydrateOrderItems,
} from "./finance/pricingService.js";

function normalizeLocation(location = null) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}

export function groupHydratedItemsBySeller(hydratedItems = []) {
  const grouped = new Map();
  for (const item of hydratedItems) {
    const sellerId = String(item?.sellerId || "");
    if (!sellerId) {
      const err = new Error("Unable to resolve seller for one or more checkout items");
      err.statusCode = 400;
      throw err;
    }
    if (!grouped.has(sellerId)) {
      grouped.set(sellerId, []);
    }
    grouped.get(sellerId).push(item);
  }
  return grouped;
}

async function computeDistanceKmForSeller({ sellerId, addressLocation, session = null }) {
  const normalizedLocation = normalizeLocation(addressLocation);
  if (!normalizedLocation) return 0;

  const query = Seller.findById(sellerId).select("location serviceRadius shopName").lean();
  if (session) query.session(session);
  const seller = await query;
  if (!seller) {
    const err = new Error("Seller not found");
    err.statusCode = 404;
    throw err;
  }
  const coords = seller?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return 0;

  const [sellerLng, sellerLat] = coords;
  const distanceInMeters = distanceMeters(
    normalizedLocation.lat,
    normalizedLocation.lng,
    Number(sellerLat),
    Number(sellerLng),
  );
  const distanceKm = Number((distanceInMeters / 1000).toFixed(3));
  
  const radius = Number(seller.serviceRadius || 5);
  if (distanceKm > radius) {
    const err = new Error(`${seller.shopName || "Store"} does not deliver to your current location (Distance: ${distanceKm}km, Service Radius: ${radius}km)`);
    err.statusCode = 400;
    throw err;
  }

  return distanceKm;
}

function sumField(rows, field) {
  return Number(
    rows.reduce((sum, row) => sum + Number(row?.[field] || 0), 0).toFixed(2),
  );
}

function round2(value) {
  return Number((Number(value || 0)).toFixed(2));
}

function buildAggregateBreakdown(sellerBreakdowns = []) {
  const aggregate = {
    currency: sellerBreakdowns[0]?.currency || "INR",
    productSubtotal: sumField(sellerBreakdowns, "productSubtotal"),
    deliveryFeeCharged: sumField(sellerBreakdowns, "deliveryFeeCharged"),
    handlingFeeCharged: sumField(sellerBreakdowns, "handlingFeeCharged"),
    tipTotal: sumField(sellerBreakdowns, "tipTotal"),
    discountTotal: sumField(sellerBreakdowns, "discountTotal"),
    taxTotal: sumField(sellerBreakdowns, "taxTotal"),
    grandTotal: sumField(sellerBreakdowns, "grandTotal"),
    sellerPayoutTotal: sumField(sellerBreakdowns, "sellerPayoutTotal"),
    adminProductCommissionTotal: sumField(sellerBreakdowns, "adminProductCommissionTotal"),
    riderPayoutBase: sumField(sellerBreakdowns, "riderPayoutBase"),
    riderPayoutDistance: sumField(sellerBreakdowns, "riderPayoutDistance"),
    riderPayoutBonus: sumField(sellerBreakdowns, "riderPayoutBonus"),
    riderTipAmount: sumField(sellerBreakdowns, "riderTipAmount"),
    riderPayoutTotal: sumField(sellerBreakdowns, "riderPayoutTotal"),
    platformLogisticsMargin: sumField(sellerBreakdowns, "platformLogisticsMargin"),
    platformTotalEarning: sumField(sellerBreakdowns, "platformTotalEarning"),
    codCollectedAmount: sumField(sellerBreakdowns, "codCollectedAmount"),
    codRemittedAmount: sumField(sellerBreakdowns, "codRemittedAmount"),
    codPendingAmount: sumField(sellerBreakdowns, "codPendingAmount"),
    distanceKmActual: sumField(sellerBreakdowns, "distanceKmActual"),
    distanceKmRounded: sumField(sellerBreakdowns, "distanceKmRounded"),
    snapshots: {
      perSeller: sellerBreakdowns.map((row, index) => ({
        index,
        sellerId: row.sellerId,
        snapshots: row.snapshots || {},
      })),
    },
    lineItems: sellerBreakdowns.flatMap((row) =>
      (Array.isArray(row.lineItems) ? row.lineItems : []).map((lineItem) => ({
        ...lineItem,
        sellerId: row.sellerId,
      })),
    ),
  };
  return aggregate;
}

function allocateCheckoutTipToSellerBreakdowns(
  sellerBreakdownEntries = [],
  totalTipAmount = 0,
) {
  const normalizedTip = round2(totalTipAmount);
  if (!Number.isFinite(normalizedTip) || normalizedTip <= 0 || sellerBreakdownEntries.length === 0) {
    return;
  }

  const totalBase = sellerBreakdownEntries.reduce(
    (sum, entry) => sum + Number(entry?.breakdown?.grandTotal || 0),
    0,
  );

  let allocatedSoFar = 0;
  sellerBreakdownEntries.forEach((entry, index) => {
    const breakdown = entry?.breakdown;
    if (!breakdown) return;

    let allocatedTip = 0;
    if (index === sellerBreakdownEntries.length - 1) {
      allocatedTip = round2(normalizedTip - allocatedSoFar);
    } else if (totalBase > 0) {
      allocatedTip = round2(
        (Number(breakdown.grandTotal || 0) / totalBase) * normalizedTip,
      );
      allocatedSoFar = round2(allocatedSoFar + allocatedTip);
    }

    breakdown.tipTotal = round2(Number(breakdown.tipTotal || 0) + allocatedTip);
    breakdown.riderTipAmount = round2(
      Number(breakdown.riderTipAmount || 0) + allocatedTip,
    );
    breakdown.riderPayoutTotal = round2(
      Number(breakdown.riderPayoutTotal || 0) + allocatedTip,
    );
    breakdown.grandTotal = round2(Number(breakdown.grandTotal || 0) + allocatedTip);
  });
}

async function computeGlobalHandlingFeeForCheckout(hydratedItems = [], { session = null } = {}) {
  const headerIds = Array.from(
    new Set(hydratedItems.map((item) => String(item?.headerCategoryId || "")).filter(Boolean)),
  );
  if (headerIds.length === 0) {
    return {
      handlingFeeCharged: 0,
      handlingCategoryUsed: null,
    };
  }

  const categoryQuery = Category.find({ _id: { $in: headerIds } })
    .select("_id name handlingFees handlingFeeType handlingFeeValue")
    .lean();
  if (session) categoryQuery.session(session);
  const categories = await categoryQuery;
  const categoryById = new Map(categories.map((category) => [String(category._id), category]));

  const handling = calculateHandlingFee(hydratedItems, {
    handlingFeeStrategy: HANDLING_FEE_STRATEGY.HIGHEST_CATEGORY_FEE,
    categoryById,
  });

  return {
    handlingFeeCharged: Number(handling.handlingFeeCharged || 0),
    handlingCategoryUsed: handling.handlingCategoryUsed || null,
  };
}

function applyGlobalHandlingFeeToSellerBreakdowns(
  sellerBreakdownEntries = [],
  globalHandling = { handlingFeeCharged: 0, handlingCategoryUsed: null },
) {
  const fee = Number(globalHandling?.handlingFeeCharged || 0);
  if (!Number.isFinite(fee) || fee <= 0 || sellerBreakdownEntries.length === 0) return;

  const usedHeaderId = String(globalHandling?.handlingCategoryUsed?.headerCategoryId || "");
  let chosenSellerId = null;
  if (usedHeaderId) {
    for (const entry of sellerBreakdownEntries) {
      const entryItems = Array.isArray(entry?.items) ? entry.items : [];
      if (entryItems.some((item) => String(item?.headerCategoryId || "") === usedHeaderId)) {
        chosenSellerId = entry.sellerId;
        break;
      }
    }
  }
  if (!chosenSellerId) {
    chosenSellerId = sellerBreakdownEntries[0]?.sellerId || null;
  }

  for (const entry of sellerBreakdownEntries) {
    const breakdown = entry?.breakdown;
    if (!breakdown) continue;

    const shouldCharge = chosenSellerId && entry.sellerId === chosenSellerId;
    const handlingFeeCharged = shouldCharge ? fee : 0;

    breakdown.handlingFeeCharged = handlingFeeCharged;
    breakdown.snapshots = breakdown.snapshots && typeof breakdown.snapshots === "object"
      ? breakdown.snapshots
      : {};
    breakdown.snapshots.handlingFeeStrategy = HANDLING_FEE_STRATEGY.HIGHEST_CATEGORY_FEE;
    breakdown.snapshots.handlingCategoryUsed = shouldCharge
      ? globalHandling.handlingCategoryUsed || {}
      : {};

    const productSubtotal = Number(breakdown.productSubtotal || 0);
    const deliveryFeeCharged = Number(breakdown.deliveryFeeCharged || 0);
    const discountTotal = Number(breakdown.discountTotal || 0);
    const taxTotal = Number(breakdown.taxTotal || 0);
    const riderPayoutTotal = Number(breakdown.riderPayoutTotal || 0);
    const adminProductCommissionTotal = Number(breakdown.adminProductCommissionTotal || 0);

    breakdown.grandTotal = round2(
      productSubtotal + deliveryFeeCharged + handlingFeeCharged - discountTotal + taxTotal,
    );
    breakdown.platformLogisticsMargin = round2(
      deliveryFeeCharged + handlingFeeCharged - riderPayoutTotal,
    );
    breakdown.platformTotalEarning = round2(
      adminProductCommissionTotal + breakdown.platformLogisticsMargin,
    );
  }
}

/**
 * Per-seller weights used to split a Spin & Win reward discount across the
 * seller orders of one checkout, so the parts always add up to the exact discount.
 */
function rewardAllocationWeights({ reward, hydratedItems, sellerIds, assembledEntries }) {
  if (reward.type === "free_delivery" && assembledEntries) {
    const feeBySeller = new Map(
      assembledEntries.map((entry) => [
        entry.sellerId,
        Number(entry.breakdown?.deliveryFeeCharged || 0),
      ]),
    );
    return sellerIds.map((id) => feeBySeller.get(id) || 0);
  }

  const relevant =
    reward.type === "free_product"
      ? hydratedItems.filter(
          (item) => reward.freeProductId && String(item.productId) === String(reward.freeProductId),
        )
      : hydratedItems.filter((item) => itemMatchesReward(item, reward));

  return sellerIds.map((id) =>
    relevant
      .filter((item) => String(item.sellerId) === id)
      .reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0),
  );
}

export async function buildCheckoutPricingSnapshot({
  orderItems = [],
  address = {},
  tipAmount = 0,
  discountTotal = 0,
  session = null,
  // Optional Spin & Win reward (CustomerReward snapshot). The discount is always
  // recomputed here from server-side prices - callers never pass an amount.
  spinReward = null,
}) {
  const hydratedItems = await hydrateOrderItems(orderItems, {
    session,
    enforceServerPricing: true,
  });
  if (!hydratedItems.length) {
    const err = new Error("Cannot checkout with empty cart");
    err.statusCode = 400;
    throw err;
  }

  const itemsBySeller = groupHydratedItemsBySeller(hydratedItems);
  const sellerIds = Array.from(itemsBySeller.keys()).sort((a, b) => a.localeCompare(b));

  const globalHandling = await computeGlobalHandlingFeeForCheckout(hydratedItems, { session });

  // Pre-compute each seller's subtotal for proportional discount distribution
  const sellerSubtotals = new Map();
  let totalSubtotal = 0;
  for (const sellerId of sellerIds) {
    const items = itemsBySeller.get(sellerId) || [];
    const subtotal = items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
    sellerSubtotals.set(sellerId, subtotal);
    totalSubtotal += subtotal;
  }

  // Builds the per-seller breakdowns. `rewardPortions` (sellerId -> amount) is the
  // Spin & Win discount share that is added to each seller's normal discount.
  const assemble = async (rewardPortions = null) => {
    const sellerBreakdownEntries = [];
    for (const sellerId of sellerIds) {
      const sellerItems = itemsBySeller.get(sellerId) || [];
      const distanceKm = await computeDistanceKmForSeller({
        sellerId,
        addressLocation: address?.location,
        session,
      });
      // Distribute discount proportionally by seller subtotal
      const sellerRatio =
        totalSubtotal > 0
          ? (sellerSubtotals.get(sellerId) || 0) / totalSubtotal
          : 1 / sellerIds.length;
      const rewardDiscount = round2(rewardPortions?.get(sellerId) || 0);
      const sellerDiscount = round2(discountTotal * sellerRatio + rewardDiscount);
      const breakdown = await generateOrderPaymentBreakdown({
        preHydratedItems: sellerItems,
        distanceKm,
        discountTotal: sellerDiscount,
        taxTotal: 0,
        session,
      });
      sellerBreakdownEntries.push({
        sellerId,
        distanceKm,
        items: sellerItems,
        rewardDiscount,
        breakdown: {
          ...breakdown,
          sellerId,
        },
      });
    }

    applyGlobalHandlingFeeToSellerBreakdowns(sellerBreakdownEntries, globalHandling);
    allocateCheckoutTipToSellerBreakdowns(sellerBreakdownEntries, tipAmount);

    const aggregateBreakdown = buildAggregateBreakdown(
      sellerBreakdownEntries.map((entry) => entry.breakdown),
    );
    return { sellerBreakdownEntries, aggregateBreakdown };
  };

  let assembled = null;
  let rewardOutcome = null;

  if (spinReward) {
    // free delivery needs the real delivery fee, so price the cart once without it first
    if (spinReward.type === "free_delivery") {
      assembled = await assemble(null);
      rewardOutcome = computeRewardDiscount({
        reward: spinReward,
        items: hydratedItems,
        deliveryFee: assembled.aggregateBreakdown.deliveryFeeCharged,
      });
    } else {
      rewardOutcome = computeRewardDiscount({ reward: spinReward, items: hydratedItems });
    }

    if (rewardOutcome.applicable) {
      const weights = rewardAllocationWeights({
        reward: spinReward,
        hydratedItems,
        sellerIds,
        assembledEntries: assembled?.sellerBreakdownEntries,
      });
      const parts = allocateProportionally(rewardOutcome.discount, weights);
      const portions = new Map(sellerIds.map((id, index) => [id, parts[index]]));
      assembled = await assemble(portions);
    }
  }

  if (!assembled) assembled = await assemble(null);

  return {
    hydratedItems,
    sellerBreakdownEntries: assembled.sellerBreakdownEntries,
    aggregateBreakdown: assembled.aggregateBreakdown,
    sellerCount: assembled.sellerBreakdownEntries.length,
    itemCount: hydratedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    spinRewardOutcome: rewardOutcome,
  };
}

export default {
  buildCheckoutPricingSnapshot,
  groupHydratedItemsBySeller,
};
