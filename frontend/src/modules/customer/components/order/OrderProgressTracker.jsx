import React from "react";
import { motion } from "framer-motion";
import { CheckCircle, Circle, Clock, Store, Bike, Home, Navigation, Truck } from "lucide-react";

const getWorkflowStatusStage = (order) => {
  if (order?.status === "cancelled") return "cancelled";
  
  const workflowStatus = String(order?.workflowStatus || "").toUpperCase();
  const legacyStatus = String(order?.status || "").toLowerCase();
  const riderStep = Number(order?.deliveryRiderStep) || 0;

  if (workflowStatus === "DELIVERED" || legacyStatus === "delivered" || riderStep >= 4) {
    return "delivered";
  }

  if (workflowStatus === "OUT_FOR_DELIVERY" || legacyStatus === "out_for_delivery" || riderStep >= 3 || order?.outForDeliveryAt) {
    return "on_the_way";
  }

  if (workflowStatus === "PICKUP_READY" || legacyStatus === "packed" || riderStep >= 2 || order?.pickupConfirmedAt) {
    return "picked_up";
  }

  if (workflowStatus === "DELIVERY_ACCEPTED" || workflowStatus === "AT_STORE" || riderStep >= 1 || order?.deliveryAcceptedAt) {
    return "out_for_pickup";
  }
  
  if (workflowStatus === "SELLER_ACCEPTED" || legacyStatus === "confirmed" || order?.acceptedAt) {
    return "preparing";
  }

  return "placed";
};

const formatTime = (isoString) => {
  if (!isoString) return "--:--";
  return new Date(isoString).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const OrderProgressTracker = ({
  order,
  estimatedArrivalText = "12:45 PM",
  arrivingInText = "8 mins",
  totalDistanceText = "—",
}) => {
  const currentStage = getWorkflowStatusStage(order);

  const steps = [
    {
      id: "placed",
      label: "Order Placed",
      subtext: "Your order has been placed.",
      time: formatTime(order?.createdAt),
      icon: CheckCircle,
    },
    {
      id: "preparing",
      label: "Preparing",
      subtext: "The store is preparing your order.",
      time: formatTime(order?.acceptedAt),
      icon: Store,
    },
    {
      id: "out_for_pickup",
      label: "Out for Pickup",
      subtext: "Delivery partner is on the way to seller",
      time: formatTime(order?.deliveryAcceptedAt),
      icon: Bike,
    },
    {
      id: "picked_up",
      label: "Picked Up",
      subtext: "Your order has been picked up",
      time: formatTime(order?.pickupConfirmedAt),
      icon: Navigation,
    },
    {
      id: "on_the_way",
      label: "On the Way",
      subtext: "Your order is on the way to you.",
      time: formatTime(order?.outForDeliveryAt),
      icon: Truck,
    },
    {
      id: "delivered",
      label: "Delivered",
      subtext: "Enjoy your order!",
      time: formatTime(order?.deliveredAt),
      icon: Home,
    },
  ];

  const getStepStatus = (stepId) => {
    if (currentStage === "cancelled") return "pending";

    const stages = ["placed", "preparing", "out_for_pickup", "picked_up", "on_the_way", "delivered"];
    const currentIndex = stages.indexOf(currentStage);
    const stepIndex = stages.indexOf(stepId);

    if (stepIndex < currentIndex) return "completed";
    if (stepIndex === currentIndex) return "active";
    return "pending";
  };

  if (currentStage === "cancelled") {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5">
        <p className="text-center text-rose-700 font-semibold">Order Cancelled</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
      <h3 className="text-base font-bold text-slate-800 mb-6">Order Status</h3>
      
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-4">
        {steps.map((step, index) => {
          const stepStatus = getStepStatus(step.id);
          const Icon = step.icon;
          const isCompleted = stepStatus === "completed";
          const isActive = stepStatus === "active";

          return (
            <div
              key={step.id}
              className="relative transition-opacity duration-200">
              <div className="flex items-start gap-4">
                {/* Icon Circle */}
                <div
                  className={`relative z-10 h-8 w-8 mt-1 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isCompleted
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : isActive
                      ? "bg-transparent text-primary border-2 border-primary"
                      : "bg-slate-100 text-slate-300"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle size={16} className="fill-current" />
                  ) : isActive ? (
                    <div className="animate-pulse">
                      <Circle size={12} className="fill-current" />
                    </div>
                  ) : (
                    <Circle size={12} strokeWidth={3} />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`text-sm font-bold ${
                        isCompleted || isActive
                          ? "text-slate-900"
                          : "text-slate-400"
                      }`}
                    >
                      {step.label}
                    </p>
                    <div className="flex items-center gap-2">
                      {isActive && (
                        <span className="text-[10px] font-bold text-primary uppercase tracking-wider bg-brand-50 px-2 py-0.5 rounded">
                          Live
                        </span>
                      )}
                      <span className={`text-xs font-medium ${isCompleted || isActive ? "text-slate-500" : "text-slate-300"}`}>
                        {step.time}
                      </span>
                    </div>
                  </div>
                  <p className={`text-xs font-medium mt-1 ${
                    isCompleted || isActive ? "text-slate-500" : "text-slate-300"
                  }`}>
                    {step.subtext}
                  </p>
                </div>
              </div>

              {/* Connecting Line */}
              {index < steps.length - 1 && (
                <div className="absolute left-4 top-10 bottom-0 w-0.5 -mb-2">
                  <div
                    className={`h-full w-full ${
                      isCompleted ? "bg-primary" : "bg-slate-100"
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </motion.div>

      {/* ETA Display */}
      {currentStage !== "delivered" && (
        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between bg-amber-50 rounded-2xl p-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Clock size={20} className="text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                  Estimated Time
                </p>
                <p className="text-lg font-black text-amber-900">{estimatedArrivalText}</p>
              </div>
            </div>
            <div className="text-right flex flex-col items-end gap-1">
              <div>
                <p className="text-xs text-amber-600 font-semibold">Arriving in</p>
                <p className="text-2xl font-black text-amber-900">{arrivingInText}</p>
              </div>
              <div className="inline-flex items-center rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">
                Total distance: {totalDistanceText}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderProgressTracker;
