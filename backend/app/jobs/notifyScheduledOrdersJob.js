import Order from "../models/order.js";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import logger from "../services/logger.js";
import moment from "moment-timezone";

const SCHEDULED_NOTIFY_INTERVAL_MS = 60000; // 1 minute

export const notifyScheduledOrders = async () => {
  const startTime = Date.now();
  try {
    const now = new Date();
    // 30 mins from now
    const targetTime = new Date(now.getTime() + 30 * 60000);

    // Find orders that are scheduled, accepted by seller, but not yet processed to delivery
    // and where the scheduled date/time is within the next 30 minutes.
    // Assuming scheduledDate holds the slot's start time in UTC, or we parse scheduledSlot.start
    // The schema has `scheduledDate` (Date) and `scheduledSlot: { start, end }`.
    
    // We need orders where scheduledDate + slot.start is <= targetTime
    // This requires some date parsing or we can just query by scheduledDate if it's stored as the exact start time.
    // For simplicity, let's query orders that are scheduled, and evaluate in JS if the query is too complex.
    
    const scheduledOrders = await Order.find({
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.SELLER_ACCEPTED,
      deliveryType: "scheduled",
      // Optional: add a flag to avoid notifying multiple times
      "flags.scheduledNotified": { $ne: true }
    }).lean();

    let notifiedCount = 0;

    for (const order of scheduledOrders) {
      if (!order.scheduledDate || !order.scheduledSlot?.start) continue;

      // Assuming scheduledDate is stored as UTC midnight of that day
      // and scheduledSlot.start is "HH:mm" (24hr IST time)
      const dateStr = moment(order.scheduledDate).tz("Asia/Kolkata").format("YYYY-MM-DD");
      const slotStartTime = moment.tz(`${dateStr} ${order.scheduledSlot.start}`, "YYYY-MM-DD HH:mm", "Asia/Kolkata");

      if (slotStartTime.isValid() && slotStartTime.valueOf() <= targetTime.getTime() && slotStartTime.valueOf() >= now.getTime()) {
        // Send notification to seller to prepare and process
        emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CONFIRMED, { // Or a specific SCHEDULED_REMINDER event
          orderId: order.orderId,
          sellerId: order.seller,
          customerId: order.customer,
          userId: order.seller, // send to seller
          sellerMessage: `Reminder: Scheduled order #${order.orderId} is due in 30 minutes. Please prepare it and click 'Process to Delivery'.`,
        });

        // Mark as notified to prevent spam
        await Order.updateOne(
          { _id: order._id },
          { $set: { "flags.scheduledNotified": true } }
        );
        notifiedCount++;
      }
    }

    const duration = Date.now() - startTime;
    if (notifiedCount > 0) {
      logger.info('Scheduled orders notification job completed', {
        jobName: 'notifyScheduledOrdersJob',
        duration,
        notified: notifiedCount
      });
    }

  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error('Scheduled orders notification job failed', {
      jobName: 'notifyScheduledOrdersJob',
      duration,
      error: err.message
    });
  }
};

export const getScheduledOrdersJobHandler = () => notifyScheduledOrders;
export const getScheduledOrdersJobInterval = () => SCHEDULED_NOTIFY_INTERVAL_MS;
