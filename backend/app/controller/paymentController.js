import handleResponse from "../utils/helper.js";
import {
  createPaymentOrderForOrderRef,
  verifyRazorpayPaymentStatus,
  processRazorpayWebhook,
} from "../services/paymentService.js";
import {
  createPaymentOrderSchema,
  verifyPaymentClientSchema,
  validateSchema,
} from "../validation/paymentValidation.js";

function resolvePaymentErrorMessage(error) {
  const directMessage = String(error?.message || "").trim();
  if (directMessage) return directMessage;

  const responseStatusText = String(error?.response?.statusText || "").trim();
  if (responseStatusText) return `Razorpay gateway error: ${responseStatusText}`;

  const causeCode = String(error?.cause?.code || error?.code || "").trim();
  if (causeCode) return `Razorpay gateway request failed (${causeCode})`;

  return "Unable to initiate payment with Razorpay right now";
}

export const createPaymentOrder = async (req, res) => {
  try {
    const payload = validateSchema(createPaymentOrderSchema, req.body || {});
    const result = await createPaymentOrderForOrderRef({
      orderRef: payload.orderRef || payload.orderId,
      userId: req.user?.id,
      idempotencyKey: req.headers["idempotency-key"] || null,
      correlationId: req.correlationId || null,
    });

    return handleResponse(
      res,
      result.duplicate ? 200 : 201,
      result.duplicate ? "Re-using existing payment" : "Payment initiated",
      {
        payment: result.payment,
        gatewayOrderId: result.gatewayOrderId,
        amount: result.amount,
        keyId: result.keyId,
        merchantOrderId: result.payment.gatewayOrderId,
      },
    );
  } catch (error) {
    console.error("[PaymentController] createPaymentOrder failed", {
      message: error?.message,
      statusCode: error?.statusCode || error?.status || 500,
      code: error?.code || error?.cause?.code || null,
      responseStatus: error?.response?.status || null,
      responseStatusText: error?.response?.statusText || null,
      orderRef: req.body?.orderRef || req.body?.orderId || null,
      userId: req.user?.id || null,
      correlationId: req.correlationId || null,
    });
    return handleResponse(
      res,
      error.statusCode || error.status || 500,
      resolvePaymentErrorMessage(error),
    );
  }
};

export const verifyClientPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return handleResponse(res, 400, "Missing required Razorpay payment details");
    }

    const verification = await verifyRazorpayPaymentStatus({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId: req.user?.id,
      correlationId: req.correlationId || null,
    });

    return handleResponse(res, 200, "Payment status verified", {
      status: verification.status,
      payment: verification.payment,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const handleRazorpayWebhook = async (req, res) => {
  try {
    const authorization = req.headers["x-razorpay-signature"];
    const rawBody = req.body;

    if (!authorization) {
        console.warn("[RazorpayWebhook] Missing verification header");
        return res.status(401).send("Unauthorized");
    }

    const result = await processRazorpayWebhook({
      rawBody,
      authorization,
      correlationId: req.correlationId || null,
    });

    if (result.accepted) {
      return res.status(200).send("OK");
    }
    
    return res.status(400).send("Bad Request");
  } catch (error) {
    console.error("[RazorpayWebhook] Error processing webhook:", error.message);
    return res.status(500).send("Internal Server Error");
  }
};

export const getPaymentStatus = async (req, res) => {
    try {
        const { id } = req.params; // Using this as gatewayOrderId
        // For Razorpay, fetching payment status without signature is just querying our DB
        // To query Razorpay API directly, we'd use razorpayClient.orders.fetch(id)
        // For now, return what we have in DB or a basic response.
        
        return handleResponse(res, 200, "Payment status retrieved (DB logic pending)", {
          merchantOrderId: id,
        });
      } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
      }
};
