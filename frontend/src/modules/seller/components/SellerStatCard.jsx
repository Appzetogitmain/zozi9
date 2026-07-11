import React from 'react';
import { BlurFade } from "@/components/ui/blur-fade";
import { MagicCard } from "@/components/ui/magic-card";
import { cn } from "@/lib/utils";

const SellerStatCard = ({ 
    label, 
    value, 
    icon: Icon, 
    colorClass, 
    bgClass, 
    gradientColor, 
    onClick, 
    delay = 0.1,
    isActive = false
}) => {
    return (
        <BlurFade delay={delay}>
            <MagicCard
                className={cn(
                    "border-none shadow-sm ring-1 ring-slate-100 p-0 overflow-hidden group bg-white transition-all duration-300",
                    onClick ? "cursor-pointer hover:shadow-md" : "",
                    isActive ? "ring-2 ring-brand-500 shadow-md" : ""
                )}
                gradientColor={gradientColor || (bgClass?.includes('indigo') || bgClass?.includes('brand') ? "#eef2ff" : bgClass?.includes('amber') ? "#fffbeb" : bgClass?.includes('emerald') ? "#ecfdf5" : bgClass?.includes('rose') ? "#fff1f2" : "#f8fafc")}
                onClick={onClick}
            >
                <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 relative z-10">
                    <div className={cn(
                        "h-10 w-10 sm:h-12 sm:w-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300 shadow-sm shrink-0",
                        bgClass || "bg-slate-50",
                        colorClass || "text-slate-600"
                    )}>
                        {Icon && <Icon className="h-5 w-5 sm:h-6 sm:w-6" />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest truncate">
                            {label}
                        </p>
                        <h4 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5 truncate">
                            {value}
                        </h4>
                    </div>
                </div>
            </MagicCard>
        </BlurFade>
    );
};

export default SellerStatCard;
