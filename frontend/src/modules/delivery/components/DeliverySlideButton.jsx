import React, { useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { deliveryApi } from "../services/deliveryApi";

/**
 * DeliveryActionButton (formerly DeliverySlideButton)
 * Standard, high-accessibility tap/click button for rider OTP and confirmation actions.
 * 
 * @param {Object} props
 * @param {string} props.orderId - The order ID for OTP generation
 * @param {Function} props.onSuccess - Callback when OTP is successfully generated
 * @param {Function} props.onError - Callback when an error occurs
 * @param {string} props.label - Label text (e.g. "GENERATE OTP", "SEND OTP TO CUSTOMER")
 * @param {string} props.bgColor - Background color class
 */
const DeliverySlideButton = ({
  orderId,
  onSuccess,
  onError,
  isReturn = false,
  isReturnDrop = false,
  label = "GENERATE OTP",
  bgColor = "bg-primary",
}) => {
  const [isLoading, setIsLoading] = useState(false);

  // Clean label if old "SLIDE TO" prefix is passed
  const displayLabel = label.replace(/^SLIDE TO\s+/i, "");

  /**
   * Handle button click - generate OTP using stored location
   */
  const handleClick = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      // Call appropriate endpoint based on flow type
      const response = isReturnDrop
        ? await deliveryApi.requestReturnDropOtp(orderId, {})
        : isReturn
          ? await deliveryApi.requestReturnOtp(orderId, {})
          : await deliveryApi.generateDeliveryOtp(orderId);

      // Handle success
      toast.success(response.data?.message || "OTP generated and sent successfully");

      if (onSuccess) {
        onSuccess(response.data);
      }
    } catch (error) {
      // Handle different error types
      const errorMessage = error.response?.data?.error?.message || error.message || "Failed to generate OTP";
      const errorCode = error.response?.data?.error?.code;

      // Display user-friendly error messages
      if (errorCode === "PROXIMITY_OUT_OF_RANGE") {
        const details = error.response?.data?.error?.details;
        const distance = details?.currentDistance;
        const range = details?.requiredRange || "0-120m";

        toast.error(
          `You are too ${distance > 120 ? "far" : "close"}. You must be within ${range} of the delivery location.`,
          { duration: 5000 }
        );
      } else if (errorCode === "LOCATION_REQUIRED" || errorCode === "LOCATION_STALE") {
        toast.error(errorMessage || "Location data is not available. Please ensure location tracking is enabled.");
      } else if (errorCode === "ORDER_NOT_FOUND") {
        toast.error("Order not found. Please refresh and try again.");
      } else if (errorCode === "UNAUTHORIZED_DELIVERY") {
        toast.error("This order is not assigned to you.");
      } else {
        toast.error(errorMessage);
      }

      if (onError) {
        onError(error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      whileHover={{ scale: isLoading ? 1 : 1.01 }}
      whileTap={{ scale: isLoading ? 1 : 0.97 }}
      className={`w-full h-14 ${bgColor} text-white rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-black/10 font-black text-sm uppercase tracking-wider transition-all disabled:opacity-75 disabled:cursor-not-allowed`}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>{isReturn ? "Requesting OTP..." : "Generating OTP..."}</span>
        </>
      ) : (
        <>
          <Send className="w-4 h-4" />
          <span>{displayLabel}</span>
          <ChevronRight className="w-5 h-5 ml-1" />
        </>
      )}
    </motion.button>
  );
};

export default DeliverySlideButton;
