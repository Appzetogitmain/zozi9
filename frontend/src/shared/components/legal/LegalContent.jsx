import React from "react";
import { useSettings } from "@core/context/SettingsContext";
import { cn } from "@/lib/utils";

// Placeholders the admin can type in legal pages; filled from General Settings
export const LEGAL_PLACEHOLDERS = [
  { key: "{appName}", label: "App name" },
  { key: "{companyName}", label: "Company name" },
  { key: "{supportEmail}", label: "Support email" },
  { key: "{supportPhone}", label: "Support phone" },
  { key: "{address}", label: "Company address" },
];

export function fillLegalPlaceholders(html, settings = {}) {
  const appName = settings.appName || "our app";
  const values = {
    "{appName}": appName,
    "{companyName}": settings.companyName || appName,
    "{supportEmail}": settings.supportEmail || "our support email",
    "{supportPhone}": settings.supportPhone || "our support number",
    "{address}": settings.address || "our registered office",
  };
  return String(html || "").replace(/\{(appName|companyName|supportEmail|supportPhone|address)\}/g, (m) => values[m]);
}

export const formatLegalDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "";

/** Renders admin-written legal HTML with readable typography */
const LegalContent = ({ html, className }) => {
  const { settings } = useSettings();
  return (
    <div
      className={cn("legal-content", className)}
      dangerouslySetInnerHTML={{ __html: fillLegalPlaceholders(html, settings || {}) }}
    />
  );
};

export default LegalContent;
