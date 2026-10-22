import React from "react";
import { cn } from "@/lib/utils";
import { todayExpiryInput } from "@/shared/utils/productExpiry";

/**
 * Expiry date + "warn me N days before" inputs for product forms.
 * onChange(field, value) with field "expiryDate" | "expiryAlertDays".
 */
const ExpiryDateFields = ({ expiryDate, expiryAlertDays, onChange, inputClassName, labelClassName }) => {
  const isPast = Boolean(expiryDate) && expiryDate <= todayExpiryInput();
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5 flex flex-col">
          <label className={labelClassName}>Expiry date (optional)</label>
          <div className="flex gap-2">
            <input
              type="date"
              value={expiryDate || ""}
              onChange={(e) => onChange("expiryDate", e.target.value)}
              className={cn(inputClassName, "flex-1")}
            />
            {expiryDate && (
              <button
                type="button"
                onClick={() => onChange("expiryDate", "")}
                className="px-3 text-xs font-bold text-slate-500 hover:text-rose-600">
                Clear
              </button>
            )}
          </div>
        </div>
        <div className="space-y-1.5 flex flex-col">
          <label className={labelClassName}>Warn me (days before)</label>
          <input
            type="number"
            min={0}
            max={365}
            value={expiryAlertDays ?? 7}
            onChange={(e) => onChange("expiryAlertDays", e.target.value)}
            className={inputClassName}
          />
        </div>
      </div>
      <p className={cn("text-[11px] font-semibold ml-1", isPast ? "text-rose-600" : "text-slate-400")}>
        {isPast
          ? "This date is today or in the past, so the product will be hidden from customers."
          : "On the expiry date the product is hidden from customers automatically. Leave empty for products that don't expire."}
      </p>
    </div>
  );
};

export default ExpiryDateFields;
