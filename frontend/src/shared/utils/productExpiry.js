// Expiry dates are stored as 00:00 store time (India) on the expiry day.
const STORE_TIME_ZONE = "Asia/Kolkata";

// Date -> "YYYY-MM-DD" for <input type="date"> (en-CA formats as ISO date)
export function toExpiryInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-CA", { timeZone: STORE_TIME_ZONE });
}

export function formatExpiryDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: STORE_TIME_ZONE,
  });
}

export function todayExpiryInput() {
  return toExpiryInput(new Date());
}

// Badge text + colours for an expiry state returned by the API
export function expiryBadge(state, daysLeft) {
  switch (state) {
    case "expired":
      return { label: "Expired · hidden", className: "bg-rose-100 text-rose-700" };
    case "expiring":
      return {
        label: daysLeft <= 1 ? "Expires tomorrow" : `Expires in ${daysLeft} days`,
        className: "bg-amber-100 text-amber-700",
      };
    case "fresh":
      return { label: `${daysLeft} days left`, className: "bg-emerald-100 text-emerald-700" };
    default:
      return { label: "No expiry date", className: "bg-slate-100 text-slate-500" };
  }
}

// Appends expiry fields to a product FormData ("" clears the date)
export function appendExpiryFields(formData, { expiryDate, expiryAlertDays }) {
  formData.append("expiryDate", expiryDate || "");
  formData.append("expiryAlertDays", String(Number.isFinite(Number(expiryAlertDays)) ? Number(expiryAlertDays) : 7));
}
