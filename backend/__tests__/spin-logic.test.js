import {
  allocateProportionally,
  computeRewardDiscount,
  effectiveCampaignStatus,
  generateRewardCode,
  periodKey,
  periodResetsAt,
  probabilityMap,
  rangesOverlap,
  validateCampaignForActivation,
  validateRewardConfig,
  validateRewardSet,
  weightedPick,
} from "../app/services/spin/spinLogic.js";

const item = (over = {}) => ({
  productId: "p1",
  sellerId: "s1",
  headerCategoryId: "h1",
  categoryId: "c1",
  subcategoryId: "sc1",
  price: 100,
  quantity: 1,
  ...over,
});

describe("weightedPick", () => {
  it("never picks a zero-weight candidate and returns null for an empty pool", () => {
    expect(weightedPick([])).toBeNull();
    expect(weightedPick([{ id: "a", weight: 0 }])).toBeNull();
    for (let i = 0; i < 200; i += 1) {
      expect(weightedPick([{ id: "a", weight: 0 }, { id: "b", weight: 5 }]).id).toBe("b");
    }
  });

  it("is deterministic for an injected random source", () => {
    const pool = [
      { id: "a", weight: 1 },
      { id: "b", weight: 1 },
      { id: "c", weight: 2 },
    ];
    expect(weightedPick(pool, () => 0).id).toBe("a");
    expect(weightedPick(pool, () => 0.3).id).toBe("b");
    expect(weightedPick(pool, () => 0.6).id).toBe("c");
    expect(weightedPick(pool, () => 0.999999).id).toBe("c");
  });

  it("follows the configured weights over many draws", () => {
    const pool = [
      { id: "low", weight: 1 },
      { id: "high", weight: 9 },
    ];
    const counts = { low: 0, high: 0 };
    const draws = 20000;
    for (let i = 0; i < draws; i += 1) counts[weightedPick(pool).id] += 1;
    const lowShare = counts.low / draws;
    expect(lowShare).toBeGreaterThan(0.07);
    expect(lowShare).toBeLessThan(0.13);
  });
});

describe("probabilityMap", () => {
  it("normalises weights to percentages and ignores inactive slices", () => {
    const map = probabilityMap([
      { _id: "a", weight: 1, isActive: true },
      { _id: "b", weight: 3, isActive: true },
      { _id: "c", weight: 100, isActive: false },
    ]);
    expect(map.a).toBe(25);
    expect(map.b).toBe(75);
    expect(map.c).toBe(0);
  });
});

describe("computeRewardDiscount", () => {
  it("applies a fixed discount capped at the eligible subtotal", () => {
    const r = computeRewardDiscount({ reward: { type: "fixed", value: 50 }, items: [item({ price: 30 })] });
    expect(r).toMatchObject({ applicable: true, discount: 30 });
    const r2 = computeRewardDiscount({ reward: { type: "fixed", value: 50 }, items: [item({ price: 200 })] });
    expect(r2.discount).toBe(50);
  });

  it("applies percentage with a maximum-discount cap", () => {
    const reward = { type: "percentage", value: 10, maxDiscount: 25 };
    expect(computeRewardDiscount({ reward, items: [item({ price: 100 })] }).discount).toBe(10);
    expect(computeRewardDiscount({ reward, items: [item({ price: 1000 })] }).discount).toBe(25);
  });

  it("enforces the minimum cart value with a helpful reason", () => {
    const r = computeRewardDiscount({
      reward: { type: "fixed", value: 20, minCartValue: 300 },
      items: [item({ price: 100, quantity: 2 })],
    });
    expect(r.applicable).toBe(false);
    expect(r.reason).toMatch(/100/);
  });

  it("only counts items that match category / seller / product rules", () => {
    const reward = { type: "percentage", value: 10, eligibleCategoryIds: ["c9"], minCartValue: 0 };
    const items = [item({ price: 500 }), item({ productId: "p2", categoryId: "c9", price: 200 })];
    expect(computeRewardDiscount({ reward, items }).discount).toBe(20);

    const none = computeRewardDiscount({ reward: { ...reward, eligibleCategoryIds: ["zzz"] }, items });
    expect(none.applicable).toBe(false);

    const bySeller = computeRewardDiscount({
      reward: { type: "fixed", value: 10, eligibleSellerIds: ["s2"] },
      items,
    });
    expect(bySeller.applicable).toBe(false);
  });

  it("free delivery discounts exactly the delivery fee (and respects the cap)", () => {
    const r = computeRewardDiscount({ reward: { type: "free_delivery" }, items: [item()], deliveryFee: 35 });
    expect(r).toMatchObject({ applicable: true, discount: 35, freeDelivery: true });
    const capped = computeRewardDiscount({
      reward: { type: "free_delivery", maxDiscount: 20 },
      items: [item()],
      deliveryFee: 35,
    });
    expect(capped.discount).toBe(20);
    const already = computeRewardDiscount({ reward: { type: "free_delivery" }, items: [item()], deliveryFee: 0 });
    expect(already.applicable).toBe(false);
  });

  it("free product needs the gift in the cart and gives one unit free", () => {
    const reward = { type: "free_product", freeProductId: "gift" };
    expect(computeRewardDiscount({ reward, items: [item()] }).applicable).toBe(false);
    const ok = computeRewardDiscount({ reward, items: [item(), item({ productId: "gift", price: 45, quantity: 3 })] });
    expect(ok).toMatchObject({ applicable: true, discount: 45 });
  });

  it("refuses types that cannot be redeemed on an order", () => {
    expect(computeRewardDiscount({ reward: { type: "wallet_cashback", value: 10 }, items: [item()] }).applicable).toBe(false);
    expect(computeRewardDiscount({ reward: { type: "no_prize" }, items: [item()] }).applicable).toBe(false);
    expect(computeRewardDiscount({ reward: null, items: [item()] }).applicable).toBe(false);
  });
});

describe("allocateProportionally", () => {
  it("always adds up to the exact total", () => {
    for (const [total, weights] of [
      [10, [1, 1, 1]],
      [33.33, [10, 20, 30]],
      [0.05, [1, 1, 1]],
      [99.99, [3, 3, 3, 3, 3, 3, 3]],
    ]) {
      const parts = allocateProportionally(total, weights);
      const sum = Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100;
      expect(sum).toBe(Math.round(total * 100) / 100);
    }
  });

  it("gives nothing to zero-weight sellers and handles all-zero weights", () => {
    expect(allocateProportionally(10, [0, 5])).toEqual([0, 10]);
    const even = allocateProportionally(9, [0, 0, 0]);
    expect(even.reduce((a, b) => a + b, 0)).toBe(9);
  });
});

describe("periodKey / periodResetsAt", () => {
  beforeAll(() => {
    process.env.SPIN_TZ_OFFSET_MINUTES = "330";
  });

  it("buckets by day in the configured timezone (IST)", () => {
    // 2026-03-10 19:00 UTC == 2026-03-11 00:30 IST
    expect(periodKey("day", new Date("2026-03-10T19:00:00Z"))).toBe("2026-03-11");
    expect(periodKey("day", new Date("2026-03-10T10:00:00Z"))).toBe("2026-03-10");
  });

  it("supports campaign, week and month buckets", () => {
    expect(periodKey("campaign")).toBe("all");
    expect(periodKey("month", new Date("2026-03-10T10:00:00Z"))).toBe("2026-03");
    expect(periodKey("week", new Date("2026-03-09T10:00:00Z"))).toBe(periodKey("week", new Date("2026-03-15T10:00:00Z")));
    expect(periodKey("week", new Date("2026-03-15T10:00:00Z"))).not.toBe(periodKey("week", new Date("2026-03-16T10:00:00Z")));
  });

  it("reports when a day period resets", () => {
    const reset = periodResetsAt("day", new Date("2026-03-10T10:00:00Z"));
    // next IST midnight = 2026-03-10 18:30 UTC
    expect(reset.toISOString()).toBe("2026-03-10T18:30:00.000Z");
    expect(periodResetsAt("campaign")).toBeNull();
  });
});

describe("effectiveCampaignStatus", () => {
  const now = new Date("2026-03-10T12:00:00Z");
  const base = { startAt: "2026-03-01T00:00:00Z", endAt: "2026-03-20T00:00:00Z" };

  it("derives live / scheduled / completed from dates", () => {
    expect(effectiveCampaignStatus({ ...base, status: "active" }, now)).toBe("active");
    expect(effectiveCampaignStatus({ ...base, startAt: "2026-04-01T00:00:00Z", status: "active" }, now)).toBe("scheduled");
    expect(effectiveCampaignStatus({ ...base, endAt: "2026-03-05T00:00:00Z", status: "active" }, now)).toBe("completed");
  });

  it("keeps manual statuses as they are", () => {
    expect(effectiveCampaignStatus({ ...base, status: "paused" }, now)).toBe("paused");
    expect(effectiveCampaignStatus({ ...base, status: "draft" }, now)).toBe("draft");
  });

  it("detects overlapping date ranges", () => {
    expect(rangesOverlap("2026-03-01", "2026-03-10", "2026-03-10", "2026-03-20")).toBe(true);
    expect(rangesOverlap("2026-03-01", "2026-03-09", "2026-03-10", "2026-03-20")).toBe(false);
  });
});

describe("validation", () => {
  it("validates reward values per type", () => {
    expect(validateRewardConfig({ type: "fixed", label: "₹10", value: 10, weight: 1 })).toEqual([]);
    expect(validateRewardConfig({ type: "fixed", label: "x", value: 0, weight: 1 })).not.toEqual([]);
    expect(validateRewardConfig({ type: "percentage", label: "x", value: 150, weight: 1 })).not.toEqual([]);
    expect(validateRewardConfig({ type: "free_product", label: "x", weight: 1 })).not.toEqual([]);
    expect(validateRewardConfig({ type: "no_prize", label: "Better luck", weight: 5 })).toEqual([]);
    expect(validateRewardConfig({ type: "fixed", label: "x", value: 5, weight: -1 })).not.toEqual([]);
    expect(validateRewardConfig({ type: "fixed", label: "x", value: 5, weight: 1, totalQuantity: 1.5 })).not.toEqual([]);
    expect(validateRewardConfig({ type: "bogus", label: "x", weight: 1 })).not.toEqual([]);
  });

  it("requires a wheel that can be spun and can never run out", () => {
    expect(validateRewardSet([{ type: "fixed", weight: 1, totalQuantity: null }])).not.toEqual([]); // < 2 slices
    expect(
      validateRewardSet([
        { type: "fixed", weight: 0 },
        { type: "fixed", weight: 0 },
      ]),
    ).not.toEqual([]); // nothing winnable
    expect(
      validateRewardSet([
        { type: "fixed", weight: 1, totalQuantity: 5 },
        { type: "percentage", weight: 1, totalQuantity: 5 },
      ]),
    ).not.toEqual([]); // can run dry
    expect(
      validateRewardSet([
        { type: "fixed", weight: 1, totalQuantity: 5 },
        { type: "no_prize", weight: 5, totalQuantity: null },
      ]),
    ).toEqual([]);
    const tooMany = Array.from({ length: 13 }, () => ({ type: "no_prize", weight: 1 }));
    expect(validateRewardSet(tooMany)).not.toEqual([]);
  });

  it("requires sane campaign dates before activation", () => {
    expect(validateCampaignForActivation({})).not.toEqual([]);
    expect(validateCampaignForActivation({ startAt: "2026-03-10", endAt: "2026-03-01" })).not.toEqual([]);
    expect(validateCampaignForActivation({ startAt: "2026-03-01", endAt: "2026-03-10" })).toEqual([]);
  });
});

describe("generateRewardCode", () => {
  it("creates readable unique-looking codes", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateRewardCode()));
    expect(codes.size).toBe(500);
    for (const code of codes) expect(code).toMatch(/^SPIN-[A-Z2-9]{8}$/);
  });
});
