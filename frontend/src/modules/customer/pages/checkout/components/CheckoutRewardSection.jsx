import React from "react";
import { Link } from "react-router-dom";
import { Gift, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysLeft, iconFor } from "../../../components/spin/spinTheme";

/**
 * CheckoutRewardSection - lets the customer pick one Spin & Win reward.
 *
 * The amount shown comes from the server's checkout preview (`preview`), never from
 * this component. `cartTotal` is only used for the friendly "add ₹X more" hint.
 *
 * Props:
 *   rewards      - available, checkout-redeemable rewards
 *   selectedId   - id of the reward the customer chose (or null)
 *   onSelect     - (id | null) => void
 *   preview      - { applied, discountAmount, reason, rewardId } from POST /orders/checkout/preview
 *   cartTotal    - number
 *   isLoading    - boolean
 */
const CheckoutRewardSection = React.memo(function CheckoutRewardSection({
  rewards,
  selectedId,
  onSelect,
  preview,
  cartTotal,
  isLoading,
}) {
  if (isLoading || !rewards?.length) return null;

  return (
    <section
      aria-label="Spin and Win rewards"
      className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-xl shadow-gray-200/50"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50">
            <Gift size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="font-black uppercase tracking-tight text-slate-800">Your rewards</h3>
            <p className="text-[11px] font-semibold text-slate-400">Spin &amp; Win · one reward per order</p>
          </div>
        </div>
        {selectedId && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-xs font-black uppercase tracking-wider text-slate-400 hover:text-red-500"
          >
            Remove
          </button>
        )}
      </div>

      <div role="radiogroup" className="space-y-2">
        {rewards.map((reward) => {
          const selected = selectedId === reward.id;
          const short = reward.minCartValue > cartTotal ? Math.ceil(reward.minCartValue - cartTotal) : 0;
          const left = daysLeft(reward.expiresAt);
          const isApplied = selected && preview?.rewardId === reward.id && preview?.applied;
          const failed = selected && preview?.rewardId === reward.id && !preview?.applied && preview?.reason;

          return (
            <button
              key={reward.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(selected ? null : reward.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition",
                selected ? "border-primary bg-brand-50" : "border-slate-100 hover:border-slate-200",
              )}
            >
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl",
                  selected ? "bg-primary text-white" : "bg-slate-100",
                )}
              >
                {selected ? <Check size={20} strokeWidth={3} /> : iconFor({ type: reward.type })}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-slate-800">{reward.label}</span>
                <span className="block text-[11px] font-semibold text-slate-500">
                  {reward.minCartValue > 0 ? `Min. order ₹${reward.minCartValue} · ` : ""}
                  {left === 0 ? "expires today" : left === 1 ? "1 day left" : `${left} days left`}
                </span>
                {short > 0 && !selected && (
                  <span className="mt-0.5 block text-[11px] font-bold text-amber-600">Add ₹{short} more to use</span>
                )}
                {isApplied && (
                  <span className="mt-0.5 block text-[11px] font-black text-primary">
                    Applied · you save ₹{preview.discountAmount}
                  </span>
                )}
                {failed && (
                  <span className="mt-0.5 flex items-start gap-1 text-[11px] font-bold text-amber-600">
                    <AlertCircle size={12} className="mt-0.5 shrink-0" />
                    {preview.reason}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <Link to="/rewards" className="mt-3 block text-center text-[11px] font-black uppercase tracking-wider text-primary">
        View all rewards
      </Link>
    </section>
  );
});

export default CheckoutRewardSection;
