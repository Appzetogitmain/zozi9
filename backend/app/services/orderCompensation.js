import Transaction from "../models/transaction.js";
import Order from "../models/order.js";
import CheckoutGroup from "../models/checkoutGroup.js";
import { releaseReservedStockForOrder } from "./stockService.js";
import { restoreRewardForOrder } from "./spin/spinRedemption.js";

/**
 * Reverse stock and fail seller transaction when an order is cancelled
 * after stock was deducted at placement.
 */
export async function compensateOrderCancellation(order, orderIdString) {
  const existing = await Order.findById(order._id);
  if (existing) {
    await releaseReservedStockForOrder(existing, {
      reason: "Cancelled",
    });
    await existing.save();
  }

  await Transaction.findOneAndUpdate(
    { reference: orderIdString },
    { status: "Failed" },
  );

  // Spin & Win: give the reward back when the whole order set is cancelled (policy-controlled)
  await restoreRewardForOrder(existing || order, { reason: "cancelled" });

  if (existing?.checkoutGroupId) {
    const activeCount = await Order.countDocuments({
      checkoutGroupId: existing.checkoutGroupId,
      status: { $ne: "cancelled" },
      workflowStatus: { $ne: "CANCELLED" },
    });
    if (activeCount === 0) {
      await CheckoutGroup.updateOne(
        { checkoutGroupId: existing.checkoutGroupId },
        {
          $set: {
            status: "CANCELLED",
            paymentStatus: "FAILED",
            "stockReservation.status": "RELEASED",
            "stockReservation.releasedAt": new Date(),
          },
        },
      );
    }
  }
}
