import dotenv from "dotenv";
import Product from "../models/product.js";
import logger from "../services/logger.js";
import { buildKey, invalidate } from "../services/cacheService.js";
import { enqueueProductIndex } from "../services/searchSyncService.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { expiredFilter, expiringSoonFilter, getExpiryState } from "../services/productExpiryService.js";

dotenv.config();

// Customers never see expired products regardless of this job (they are filtered at
// query time). The job only warns sellers and refreshes caches / search index.
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const PRODUCT_EXPIRY_JOB_INTERVAL_MS = parseInt(
  process.env.PRODUCT_EXPIRY_JOB_INTERVAL_MS || `${DEFAULT_INTERVAL_MS}`,
  10,
);
const BATCH_SIZE = 200;
const NOTIFY_FIELDS = "_id name sellerId expiryDate expiryAlertDays mainImage";

// Claims the alert for this exact expiry date so parallel runs never notify twice
async function claimAlert(product, field, now) {
  const result = await Product.updateOne(
    { _id: product._id, expiryDate: product.expiryDate, [field]: null },
    { $set: { [field]: now, ...(field === "expiredAlertSentAt" ? { expiryAlertSentAt: product.expiryAlertSentAt || now } : {}) } },
  );
  return result.modifiedCount === 1;
}

function notificationPayload(product, now) {
  return {
    productId: String(product._id),
    productName: product.name,
    sellerId: String(product.sellerId),
    expiryDate: product.expiryDate,
    daysLeft: getExpiryState(product, now).daysLeft,
    imageUrl: product.mainImage || "",
  };
}

const runProductExpiryJob = async () => {
  const startTime = Date.now();
  try {
    const now = new Date();

    const expiringSoon = await Product.find({ ...expiringSoonFilter(now), expiryAlertSentAt: null })
      .select(NOTIFY_FIELDS)
      .limit(BATCH_SIZE)
      .lean();
    let warned = 0;
    for (const product of expiringSoon) {
      if (await claimAlert(product, "expiryAlertSentAt", now)) {
        emitNotificationEvent(NOTIFICATION_EVENTS.PRODUCT_EXPIRING_SOON, notificationPayload(product, now));
        warned += 1;
      }
    }

    const expired = await Product.find({ ...expiredFilter(now), expiredAlertSentAt: null })
      .select(`${NOTIFY_FIELDS} expiryAlertSentAt`)
      .limit(BATCH_SIZE)
      .lean();
    let expiredCount = 0;
    for (const product of expired) {
      if (await claimAlert(product, "expiredAlertSentAt", now)) {
        emitNotificationEvent(NOTIFICATION_EVENTS.PRODUCT_EXPIRED, notificationPayload(product, now));
        enqueueProductIndex(String(product._id)).catch(() => {});
        invalidate(`cache:catalog:product:${product._id}`).catch(() => {});
        expiredCount += 1;
      }
    }
    if (expiredCount > 0) {
      await invalidate(buildKey("catalog", "productList", "*")).catch(() => {});
      await invalidate("cache:offersections:public:*").catch(() => {});
    }

    if (warned > 0 || expiredCount > 0) {
      logger.info("Product expiry job completed", {
        jobName: "productExpiryJob",
        duration: Date.now() - startTime,
        expiringSoonNotified: warned,
        expiredNotified: expiredCount,
      });
    }
  } catch (err) {
    logger.error("Product expiry job failed", {
      jobName: "productExpiryJob",
      duration: Date.now() - startTime,
      error: err.message,
      stack: err.stack,
    });
  }
};

export const getProductExpiryJobHandler = () => runProductExpiryJob;
export const getProductExpiryJobInterval = () => PRODUCT_EXPIRY_JOB_INTERVAL_MS;
