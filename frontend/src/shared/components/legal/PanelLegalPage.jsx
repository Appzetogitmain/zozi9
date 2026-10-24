import React, { useEffect, useState } from "react";
import { ScrollText, ShieldCheck } from "lucide-react";
import LegalContent, { formatLegalDate } from "./LegalContent";

/**
 * Terms / Privacy page inside the seller or delivery app (the app's own layout wraps it).
 * fetchPage(role, type) returns the axios promise for /legal/:role/:type.
 */
const PanelLegalPage = ({ role, type, audience, fetchPage }) => {
  const [content, setContent] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const title = type === "TERMS" ? "Terms & Conditions" : "Privacy Policy";
  const Icon = type === "TERMS" ? ScrollText : ShieldCheck;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchPage(role, type)
      .then((res) => {
        if (cancelled || !res.data?.success) return;
        setContent(res.data.result?.content || "");
        setUpdatedAt(res.data.result?.updatedAt || null);
      })
      .catch((err) => console.error(`Failed to fetch ${role} ${type}:`, err))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [role, type, fetchPage]);

  return (
    <div className="mx-auto max-w-4xl py-3">
      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-6 flex items-center gap-4 border-b border-slate-100 pb-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-primary">
            <Icon size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 sm:text-2xl">{title}</h1>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              For {audience}
              {updatedAt && content ? ` · Last updated ${formatLegalDate(updatedAt)}` : ""}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : content ? (
          <LegalContent html={content} />
        ) : (
          <p className="py-16 text-center text-sm text-slate-500">{title} is not available at the moment.</p>
        )}
      </div>
    </div>
  );
};

export default PanelLegalPage;
