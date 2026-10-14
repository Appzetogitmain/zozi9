# Spin & Win

Customers spin a wheel for discounts, free delivery, wallet cashback or a free gift.
The winner is always chosen **on the server**; the app only animates to the slice the server returns.

## 1. Where it plugs into the existing app

| Area | Existing piece reused | What Spin & Win adds |
| --- | --- | --- |
| Auth | `verifyToken`, `optionalVerifyToken`, `allowRoles` | customer routes (`user`/`customer`), admin routes (`admin`) |
| Responses / errors | `handleResponse` (`{ success, error, message, result }`) | same shape everywhere |
| Rate limiting | `createRateLimiter` (Redis, in-memory fallback) | per-customer limits on spin / read / impression |
| Checkout pricing | `buildCheckoutPricingSnapshot` (server prices, per-seller breakdown) | optional `spinReward`; discount recomputed from server prices |
| Order placement | `placeOrderAtomic` (one MongoDB transaction) | reward is claimed in the **same transaction** as the orders |
| Cancellation / failed payment | `compensateOrderCancellation`, `paymentService` failure path | reward restore (policy controlled) |
| Returns | `completeReturnAndRefund` | reward restore after a **full** return (policy controlled) |
| Wallet | `User.walletBalance` + `Transaction` (`type: "Bonus"`) | cashback rewards credit the wallet |
| Settlement | `sellerPayoutTotal` is computed from item prices, not from the paid total | company-funded discounts never reduce seller payouts |

Not changed on purpose: the existing coupon flow (see "Known limitations").

## 2. Files

**Backend – new**

- `app/models/spinSettings.js`, `spinCampaign.js`, `spinReward.js`, `spinAttempt.js`, `spinParticipation.js`, `customerReward.js`, `rewardLedger.js`, `spinImpression.js`
- `app/services/spin/spinLogic.js` (pure logic: weighted pick, discount maths, validation, periods)
- `app/services/spin/spinService.js` (campaign lookup, eligibility, the spin, my rewards)
- `app/services/spin/spinRedemption.js` (validate / claim / restore a reward for an order)
- `app/services/spin/spinReportService.js`
- `app/controller/spinController.js`, `spinAdminController.js`
- `app/routes/spinRoutes.js`, `app/validation/spinValidation.js`
- `__tests__/spin-logic.test.js`, `__tests__/spin-routes-security.test.js`
- `scripts/verify-spin-integration.mjs`, `scripts/cleanup-spin-verify-dbs.mjs`

**Backend – modified**

- `app/routes/index.js` (mounts `/api/spin` and `/api/admin/spin`)
- `app/models/order.js` (`spinRewardId`, `spinRewardDiscount`)
- `app/services/checkoutPricingService.js` (optional `spinReward`, exact per-seller split)
- `app/services/finance/pricingService.js` (hydrated items also carry `categoryId` / `subcategoryId`)
- `app/services/orderPlacementService.js` (load + price + claim the reward inside the transaction)
- `app/controller/orderFinanceController.js`, `app/validation/financeValidation.js` (`spinRewardId`, preview result)
- `app/services/orderCompensation.js`, `app/services/paymentService.js`, `app/controller/orderController.js` (restore hooks)
- `.env.example`, `package.json` (script `test:spin-integration`)

**Frontend – new**

- Customer: `components/spin/SpinWheel.jsx`, `SpinWinPopup.jsx`, `spinTheme.js`, `pages/MyRewardsPage.jsx`, `pages/checkout/components/CheckoutRewardSection.jsx`
- Admin: `pages/SpinWinManagement.jsx`, `pages/spin/SpinSettingsPanel.jsx`, `SpinCampaignEditor.jsx`, `SpinRewardForm.jsx`, `SpinReportsPanel.jsx`, `EntityPicker.jsx`

**Frontend – modified**

`customerApi.js`, `adminApi.js`, `Home.jsx` (mounts the popup), `routes/index.jsx` (`/rewards`), `ProfilePage.jsx` (menu item), `CheckoutPage.jsx`, `CheckoutPricingBreakdown.jsx`, admin `routes/index.jsx` (Marketing Tools → Spin & Win), `ImageSpecHint.jsx` (popup logo size hint).

## 3. Database

| Collection | Purpose | Key indexes |
| --- | --- | --- |
| `spinsettings` | singleton master switches (`key: "default"`) | `key` unique |
| `spincampaigns` | campaign, dates, popup rules, audience, limits, T&C, audit log | `status, startAt, endAt` |
| `spinrewards` | wheel slices: type, value, weight, inventory, rules | `campaignId, sortOrder, _id` |
| `spinparticipations` | spins used per (campaign, customer, period) | **unique** `campaignId, customerId, periodKey` |
| `spinattempts` | every spin and its outcome | **unique** `customerId, idempotencyKey`; `campaignId, createdAt`; `campaignId, rewardId` |
| `customerrewards` | coupons a customer won (frozen rule snapshot) | **unique** `code`; **unique** `attemptId`; `customerId, status, expiresAt`; `orderId` |
| `rewardledgers` | append-only money trail (issued / redeemed / restored / cashback) | `campaignId, entryType, createdAt`; `orderId` |
| `spinimpressions` | popup views (TTL 180 days) | `campaignId, viewerKey`; TTL on `createdAt` |
| `orders` (existing) | + `spinRewardId` (indexed), `spinRewardDiscount` | |

Mongoose creates the indexes on start (`autoIndex` is not disabled in this project). No data migration or backfill is needed: all new fields are optional.

## 4. API

All responses use `{ success, error, message, result }`. Errors from the spin endpoints also carry a `code`.

### Customer (`/api/spin`)

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/campaign/active` | optional | live campaign for the popup + this viewer's eligibility. Weights and stock are never included |
| GET | `/eligibility` | optional | `canSpin`, `remainingSpins`, `reason` |
| POST | `/impression` | optional | `{ campaignId, viewerKey? }` – for reports |
| POST | `/play` | customer | header **`Idempotency-Key`** required (8–100 chars); 10 requests/min/customer |
| GET | `/my-rewards?status=available\|redeemed\|expired&page&limit` | customer | only the caller's rewards |
| POST | `/redeem` | customer | informational: redemption happens when the order is placed (below) |

`GET /api/spin/campaign/active`

```json
{ "success": true, "result": {
  "active": true, "showPopup": true,
  "campaign": { "id": "…", "title": "Diwali Spin & Win", "popup": { "delaySeconds": 3, "frequency": "daily" },
    "terms": "…", "slices": [ { "id": "…", "label": "₹20 OFF", "type": "fixed", "valueLabel": "₹20", "color": "", "icon": "rupee" } ] },
  "eligibility": { "eligible": true, "canSpin": true, "remainingSpins": 1, "usedSpins": 0, "maxSpins": 1, "reason": "", "resetsAt": null }
} }
```

`POST /api/spin/play` (header `Idempotency-Key: 6f0c…`) → `201` (`200` when the same key is replayed)

```json
{ "success": true, "result": {
  "attemptId": "…", "outcome": "reward", "segmentIndex": 2, "label": "₹20 OFF", "remainingSpins": 0, "duplicate": false,
  "reward": { "id": "…", "code": "SPIN-7QK2M9XA", "type": "fixed", "value": 20, "minCartValue": 199, "maxDiscount": null,
              "expiresAt": "2026-10-21T10:00:00.000Z", "status": "available" } } }
```

Errors: `401 LOGIN_REQUIRED`, `400 IDEMPOTENCY_REQUIRED`, `403 DISABLED / NOT_NEW_CUSTOMER / NOT_EXISTING_CUSTOMER`, `404 NO_CAMPAIGN`, `429 LIMIT_REACHED`.

### Checkout

Both endpoints accept an optional `spinRewardId` (the `id` from `my-rewards`). The client never sends an amount.

- `POST /api/orders/checkout/preview` → adds `result.spinReward`:
  `{ rewardId, applied, discountAmount, freeDelivery, code, label, reason }`. A reward that does not apply never blocks the preview; `reason` explains why (e.g. "Add items worth ₹80 more…").
- `POST /api/orders` → the reward is validated and redeemed inside the order transaction. Errors: `404 REWARD_NOT_FOUND`, `409 REWARD_USED / REWARD_CONFLICT`, `410 REWARD_EXPIRED`, `400 REWARD_NOT_APPLICABLE`. Any error rolls the whole order back, so the reward stays available.

### Admin (`/api/admin/spin`, role `admin`)

| Method | Path | |
| --- | --- | --- |
| GET / PATCH | `/settings` | `enabled`, `popupEnabled`, `allowRedemptionWhenDisabled`, `autoApplyReward`, `restoreOnCancel`, `restoreOnRefund` |
| POST / GET | `/campaigns` | create (always starts as `draft`) / list (`?status=&page=&limit=`) |
| GET / PATCH | `/campaigns/:id` | detail (rewards with probability %, customer preview, audit log) / edit |
| PATCH | `/campaigns/:id/status` | `{ "status": "active" \| "paused" \| "draft" \| "completed" }` |
| POST | `/campaigns/:id/rewards` | add a slice |
| PUT | `/campaigns/:id/rewards/order` | `{ "ids": [ … ] }` reorder |
| PATCH / DELETE | `/rewards/:id` | edit / delete (a reward that was already won is deactivated instead) |
| GET | `/reports?campaignId&from&to` | funnel, coupons, orders & revenue, cost, per-reward table, spins per day |

Activation rules (`400/409` with a readable message): start/end dates set and ordered, 2–12 active slices, at least one winnable slice, the wheel must be able to **never run out** (a no-prize slice or an unlimited reward), and no overlap with another active/scheduled campaign.

Seller endpoint (`GET /api/seller/spin/reports`): **not built** – see limitations.

## 5. Flows

**Customer**
1. Home loads → `SpinWinPopup` asks `/campaign/active`. It shows only if the campaign is live, the popup switch is on, the viewer is eligible and the browser-side frequency rule allows it (once per session / day / week / ever). Closing the popup is always possible.
2. *Spin now* → one request with a fresh `Idempotency-Key` (re-used if the request has to be retried) → the wheel decelerates onto `segmentIndex` → result card (value, minimum cart, expiry, code, conditions) → *View my rewards* / *Continue shopping*.
3. *My Rewards* (`/rewards`, linked from Profile): Available / Redeemed / Expired tabs, copy code, days left, linked order.
4. Checkout shows the available rewards. Picking one (or auto-apply, if the admin enabled it) adds `spinRewardId` to the preview; the order summary shows the server-calculated line; the order sends the id only when the latest preview said it applies.

**Admin** – Marketing Tools → *Spin & Win*: Campaigns (create, edit, rewards, preview, history, activate / pause / end), Settings, Reports.

**Seller** – no new screens. Orders paid with a reward show the discount in the usual totals; the seller payout is unchanged.

## 6. Probability and inventory

- Weights are relative. Probability = `weight / sum(weights of active slices)`; the admin form shows the live percentage. A weight of 0 can never win.
- `crypto.randomInt` is the randomness source (`secureRandomFloat`).
- Per spin, inside one transaction: (1) claim a participation slot with a conditional `$inc` (`count < maxSpins`); (2) drop slices whose per-customer limit is reached; (3) pick a slice; (4) claim inventory with `findOneAndUpdate({ awardedCount < totalQuantity }, { $inc })` – if someone else just took the last unit the slice is removed and the pick is repeated; (5) write the attempt and the coupon.
- If nothing is winnable the customer gets a safe "better luck next time" (the activation rule above makes this rare).
- Verified against a real replica set: 12 parallel spins by one customer → exactly 1 succeeds; 25 customers racing for a 3-unit reward → exactly 3 are issued.

## 7. Coupons, discount maths and settlement

- A won reward is a `customerrewards` document with a **frozen copy** of the rule; later admin edits do not change it.
- Discount = computed in `computeRewardDiscount` from server prices: fixed (capped at the eligible subtotal), percentage (+ `maxDiscount`), free delivery (= the server's delivery fee), free product (one unit of the gift if it is in the cart). Eligibility (categories / products / sellers) and the minimum value apply to the *eligible* subtotal.
- With several sellers the discount is split so the parts always add up to the exact amount; each seller order stores its share in `spinRewardDiscount`.
- Company-funded: the discount lowers `grandTotal` only. `sellerPayoutTotal` and `riderPayoutTotal` are untouched (verified). The company cost is recorded in `rewardledgers` and shown in the report. `platformTotalEarning` is not reduced (same as every other discount in the existing finance model).
- Cashback: wallet credit + `Transaction { type: "Bonus" }`, reference `SPIN-CB-<attemptId>` (unique).
- Restore policy (admin settings): cancelled / payment-failed orders (`restoreOnCancel`, default on) and full returns (`restoreOnRefund`, default off). A reward is restored only if it has not expired and, for multi-seller checkouts, only when every order that used it is cancelled/returned. Restoring twice is harmless.

## 8. Tests

- `npm test -- spin-logic spin-routes-security` – 53 unit/route tests (no database).
- `npm run test:spin-integration` – 71 checks on a **real MongoDB** (needs a replica set because of transactions). It creates a throw-away database `spin_verify_<timestamp>` on the same cluster and drops it at the end; `node scripts/cleanup-spin-verify-dbs.mjs` removes leftovers if a run is interrupted. Covers concurrency, idempotency, inventory, per-customer limits, cashback, ownership, redemption races, restore, enable/disable, report numbers, the real pricing engine and `placeOrderAtomic`.

## 9. Deployment

1. Deploy the backend (new collections and indexes are created automatically on the first start).
2. Optional env: `SPIN_TZ_OFFSET_MINUTES` (default `330`, IST) for per-day/week/month limits.
3. Spin & Win is **off by default**. In Admin → Marketing Tools → Spin & Win: create a campaign, add rewards, activate it, then switch on *Spin & Win is live* in Settings.
4. Deploy the frontend.

## 10. Known limitations / remaining work

- **Seller-funded rewards and the seller report endpoint are not implemented.** Only company-funded rewards exist; the model field `fundedBy` accepts only `"company"` so nothing is silently half-supported.
- Free-product rewards discount the gift when it is in the cart; they do not add the item to the cart or reserve stock for it.
- Wallet-cashback rewards are credited immediately at spin time. They are not tied to an order, so there is nothing to reverse or restore later.
- Fuzzy matching, multiple simultaneous campaigns (only one may be live) and A/B tests are out of scope.
- **Existing coupon flow (not touched):** `POST /orders` ignores the `discountTotal` sent by the app and never receives `couponId`, so a classic coupon shows a discount on the checkout screen but is not applied to the stored order. Spin & Win does not depend on it, but it is worth fixing separately.
- Nine older backend test suites fail on the unmodified code as well (missing exports / modules in their mocks); they are unrelated to this feature.
