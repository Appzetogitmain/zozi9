import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Truck, CalendarClock, Clock, Calendar as CalendarIcon, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { customerApi } from "../../../services/customerApi";
import { format, addDays } from "date-fns";

const CheckoutDeliveryTypeSelector = ({
  deliveryType,
  setDeliveryType,
  scheduledDate,
  setScheduledDate,
  scheduledSlot,
  setScheduledSlot,
}) => {
  const [slots, setSlots] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Generate next 7 days for date selection
  const availableDates = Array.from({ length: 7 }).map((_, i) => addDays(new Date(), i));

  useEffect(() => {
    if (deliveryType === "scheduled") {
      fetchSlots();
    }
  }, [deliveryType]);

  const fetchSlots = async () => {
    setIsLoading(true);
    try {
      const response = await customerApi.getDeliverySlots();
      const data = response.data?.result || response.data || [];
      const sortedData = (Array.isArray(data) ? data : []).sort((a, b) =>
        a.startTime.localeCompare(b.startTime)
      );
      setSlots(sortedData);
    } catch (error) {
      console.error("Failed to fetch slots", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-[2rem] p-5 sm:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60 transition-all duration-500 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
      <h3 className="text-[17px] font-black text-slate-900 mb-6 flex items-center gap-3 tracking-tight">
        <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
          <Truck className="h-5 w-5" strokeWidth={2.5} />
        </div>
        Delivery Options
      </h3>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
        <button
          type="button"
          onClick={() => setDeliveryType("express")}
          className={cn(
            "relative p-4 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all duration-300 border-2 overflow-hidden group",
            deliveryType === "express"
              ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
              : "border-slate-100 bg-white text-slate-600 hover:border-brand-200 hover:bg-brand-50/50"
          )}
        >
          {deliveryType === "express" && (
            <motion.div
              layoutId="deliveryTypeBg"
              className="absolute inset-0 bg-gradient-to-br from-brand-100/50 to-transparent"
              initial={false}
              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
            />
          )}
          <div className="relative z-10 flex flex-col items-center">
            <Clock
              className={cn(
                "h-6 w-6 mb-1 transition-transform duration-300",
                deliveryType === "express" ? "scale-110" : "group-hover:scale-110"
              )}
            />
            <span className="font-black tracking-wide text-sm">Express</span>
            <span className="text-[10px] font-semibold opacity-70 mt-0.5">As soon as possible</span>
          </div>
          {deliveryType === "express" && (
            <CheckCircle2 className="absolute top-2 right-2 h-4 w-4 text-brand-500" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setDeliveryType("scheduled");
            if (!scheduledDate) setScheduledDate(availableDates[0].toISOString().split('T')[0]);
          }}
          className={cn(
            "relative p-4 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all duration-300 border-2 overflow-hidden group",
            deliveryType === "scheduled"
              ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm"
              : "border-slate-100 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/50"
          )}
        >
          {deliveryType === "scheduled" && (
            <motion.div
              layoutId="deliveryTypeBg"
              className="absolute inset-0 bg-gradient-to-br from-indigo-100/50 to-transparent"
              initial={false}
              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
            />
          )}
          <div className="relative z-10 flex flex-col items-center">
            <CalendarClock
              className={cn(
                "h-6 w-6 mb-1 transition-transform duration-300",
                deliveryType === "scheduled" ? "scale-110" : "group-hover:scale-110"
              )}
            />
            <span className="font-black tracking-wide text-sm">Scheduled</span>
            <span className="text-[10px] font-semibold opacity-70 mt-0.5">Pick a time slot</span>
          </div>
          {deliveryType === "scheduled" && (
            <CheckCircle2 className="absolute top-2 right-2 h-4 w-4 text-indigo-500" />
          )}
        </button>
      </div>

      <AnimatePresence>
        {deliveryType === "scheduled" && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 24 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-5 p-5 bg-slate-50/80 rounded-2xl border border-slate-100">
              {/* Date Selection */}
              <div>
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  Select Date
                </label>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-2 px-2 snap-x">
                  {availableDates.map((date, idx) => {
                    const dateStr = date.toISOString().split("T")[0];
                    const isSelected = scheduledDate === dateStr;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setScheduledDate(dateStr)}
                        className={cn(
                          "snap-start shrink-0 flex flex-col items-center justify-center p-3 rounded-xl border transition-all min-w-[70px]",
                          isSelected
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-md"
                            : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50"
                        )}
                      >
                        <span className="text-[10px] font-bold uppercase opacity-80">
                          {idx === 0 ? "Today" : idx === 1 ? "Tmrw" : format(date, "EEE")}
                        </span>
                        <span className="text-lg font-black mt-0.5">{format(date, "dd")}</span>
                        <span className="text-[10px] font-bold opacity-80">{format(date, "MMM")}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Slot Selection */}
              <div>
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                  <Clock className="h-3.5 w-3.5" />
                  Select Time Slot
                </label>
                {isLoading ? (
                  <div className="h-20 flex items-center justify-center">
                    <div className="animate-spin h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
                  </div>
                ) : slots.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {slots.map((slot) => {
                      const isSelected = scheduledSlot?.slotId === slot._id;
                      return (
                        <button
                          key={slot._id}
                          type="button"
                          onClick={() => setScheduledSlot({ slotId: slot._id, start: slot.startTime, end: slot.endTime })}
                          className={cn(
                            "px-3 py-2.5 rounded-xl border text-xs font-bold transition-all text-center",
                            isSelected
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-md"
                              : "bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
                          )}
                        >
                          {slot.startTime} - {slot.endTime}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center p-4 bg-white rounded-xl border border-dashed border-slate-200">
                    <p className="text-xs font-semibold text-slate-500">No time slots available for this date.</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CheckoutDeliveryTypeSelector;
