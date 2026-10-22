import React from "react";
import { Zap, Timer } from "lucide-react";
import ProductCard from "../shared/ProductCard";
import { customerApi } from "../../services/customerApi";
import { cn } from "@/lib/utils";

const pad = (n) => String(n).padStart(2, "0");

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return days > 0 ? `${days}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// Shape a flash item into what ProductCard expects (flash variant first so the card adds it)
function toCardProduct(item) {
  const product = item.product || {};
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const flashVariant = variants.find((v) => String(v?.sku || "").trim() === item.variantSku);
  const ordered = flashVariant ? [flashVariant, ...variants.filter((v) => v !== flashVariant)] : variants;
  return {
    ...product,
    id: product._id,
    variants: ordered,
    image: product.mainImage || product.image || "",
    price: item.flashPrice,
    originalPrice: item.mrp,
    weight: item.variantName && item.variantName !== "Default" ? item.variantName : product.weight || "1 unit",
    deliveryTime: "8-15 mins",
  };
}

const StockBar = ({ item }) => {
  const soldPct = item.totalQuantity
    ? Math.min(100, Math.round((item.soldQuantity / item.totalQuantity) * 100))
    : 0;
  const almostGone = item.remaining > 0 && item.remaining <= Math.max(3, item.totalQuantity * 0.2);
  return (
    <div className="mt-1.5 px-0.5">
      <div className="h-1.5 w-full bg-orange-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-orange-400 to-rose-500 rounded-full transition-all"
          style={{ width: `${soldPct}%` }}
        />
      </div>
      <p className={cn("mt-1 text-[10px] font-bold leading-tight", almostGone ? "text-rose-600" : "text-slate-500")}>
        {item.remaining <= 0 ? "Sold out" : almostGone ? `Only ${item.remaining} left!` : `${item.remaining} left`}
        {item.perCustomerLimit > 0 && item.remaining > 0 && (
          <span className="block text-slate-400 font-semibold">Max {item.perCustomerLimit} per order</span>
        )}
      </p>
    </div>
  );
};

const SaleBlock = ({ sale, now }) => {
  const isLive = sale.status === "live";
  const target = new Date(isLive ? sale.endAt : sale.startAt).getTime();
  const maxOff = sale.items.reduce(
    (max, i) => Math.max(max, i.mrp > 0 ? Math.round(((i.mrp - i.flashPrice) / i.mrp) * 100) : 0),
    0,
  );

  return (
    <section className="mb-4 overflow-hidden bg-gradient-to-br from-orange-50 via-amber-50 to-white border-y border-orange-100 shadow-[0_10px_30px_rgba(249,115,22,0.10)]">
      <div className="container mx-auto px-4 md:px-8 lg:px-[50px] pt-4 pb-3 md:pt-6 md:pb-5">
        <div className="flex items-center justify-between gap-3 mb-3 md:mb-5">
          <div className="flex items-center gap-2.5 md:gap-4 min-w-0">
            <div
              className={cn(
                "h-10 w-10 md:h-14 md:w-14 shrink-0 rounded-2xl flex items-center justify-center text-white shadow-lg",
                isLive ? "bg-orange-500 shadow-orange-200 animate-pulse" : "bg-slate-800 shadow-slate-200",
              )}>
              <Zap className="h-5 w-5 md:h-7 md:w-7" fill="currentColor" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className={cn(
                    "text-[9px] md:text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest text-white",
                    isLive ? "bg-rose-500" : "bg-slate-700",
                  )}>
                  {isLive ? "Flash sale" : "Coming soon"}
                </span>
                {maxOff > 0 && (
                  <span className="text-[10px] md:text-xs font-black text-orange-600 uppercase">Up to {maxOff}% off</span>
                )}
              </div>
              <h3 className="text-base md:text-2xl font-black text-slate-900 tracking-tight leading-tight truncate">
                {sale.title}
              </h3>
              {sale.description && (
                <p className="text-[11px] md:text-sm font-semibold text-slate-500 truncate">{sale.description}</p>
              )}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[9px] md:text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-end gap-1">
              <Timer size={12} /> {isLive ? "Ends in" : "Starts in"}
            </p>
            <p
              className={cn(
                "font-mono font-black text-sm md:text-xl tabular-nums px-2 py-0.5 rounded-lg",
                isLive ? "bg-slate-900 text-white" : "bg-white text-slate-800 ring-1 ring-slate-200",
              )}>
              {formatCountdown(target - now)}
            </p>
          </div>
        </div>

        <div className="flex overflow-x-auto gap-3 md:gap-6 pb-2 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scroll-smooth">
          {sale.items.map((item) => {
            const product = toCardProduct(item);
            const soldOut = item.remaining <= 0;
            return (
              <div key={item.itemId} className="w-[126px] sm:w-[136px] md:w-[148px] shrink-0 snap-start">
                {isLive && !soldOut ? (
                  <ProductCard
                    product={product}
                    badge="FLASH"
                    className="bg-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.1)] border-orange-100 transition-all"
                    compact={true}
                  />
                ) : (
                  // Upcoming or sold-out deals are shown but cannot be added at the flash price
                  <div className="relative bg-white rounded-2xl border border-orange-100 p-2 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.1)]">
                    <div className="aspect-square rounded-xl bg-slate-50 overflow-hidden">
                      {product.image && (
                        <img
                          src={product.image}
                          alt={product.name}
                          loading="lazy"
                          className={cn("w-full h-full object-contain", soldOut && "grayscale opacity-60")}
                        />
                      )}
                    </div>
                    <p className="mt-1.5 text-[11px] font-bold text-slate-800 line-clamp-2 leading-tight min-h-[28px]">
                      {product.name}
                    </p>
                    <p className="mt-1 text-sm font-black text-slate-900">
                      ₹{item.flashPrice}{" "}
                      <span className="text-[11px] font-semibold text-slate-400 line-through">₹{item.mrp}</span>
                    </p>
                    <span
                      className={cn(
                        "absolute top-3 left-3 text-[9px] font-black px-1.5 py-0.5 rounded uppercase text-white",
                        soldOut ? "bg-slate-500" : "bg-slate-800",
                      )}>
                      {soldOut ? "Sold out" : "Soon"}
                    </span>
                  </div>
                )}
                {isLive && <StockBar item={item} />}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

/**
 * Live and upcoming flash sales near the customer, each with its own countdown.
 * Renders nothing when no sale is running or starting within 24h.
 */
const FlashSaleSection = ({ location }) => {
  const [sales, setSales] = React.useState([]);
  const [clockOffset, setClockOffset] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());

  const lat = location?.latitude;
  const lng = location?.longitude;
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);

  const load = React.useCallback(async () => {
    if (!hasLocation) {
      setSales([]);
      return;
    }
    try {
      const res = await customerApi.getFlashSales({ lat, lng });
      const result = res.data?.result || {};
      // Count down against server time so a wrong phone clock doesn't show the wrong timer
      if (result.serverNow) setClockOffset(new Date(result.serverNow).getTime() - Date.now());
      setSales(Array.isArray(result.sales) ? result.sales : []);
    } catch (error) {
      console.error("Failed to load flash sales", error);
    }
  }, [hasLocation, lat, lng]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (sales.length === 0) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sales.length]);

  const serverNow = now + clockOffset;

  // When a sale starts or ends, fetch again so prices and the list switch over
  const nextBoundary = React.useMemo(() => {
    const times = sales.map((s) => new Date(s.status === "live" ? s.endAt : s.startAt).getTime());
    return times.length ? Math.min(...times) : null;
  }, [sales]);
  React.useEffect(() => {
    if (nextBoundary && serverNow >= nextBoundary + 1000) load();
  }, [serverNow, nextBoundary, load]);

  const visible = sales.filter((s) => new Date(s.endAt).getTime() > serverNow);
  if (visible.length === 0) return null;

  return (
    <div className="w-full">
      {visible.map((sale) => (
        <SaleBlock key={sale._id} sale={sale} now={serverNow} />
      ))}
    </div>
  );
};

export default FlashSaleSection;
