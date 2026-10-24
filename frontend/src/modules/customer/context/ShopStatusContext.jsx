import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { customerApi } from "../services/customerApi";
import { useLocation } from "./LocationContext";

const REFRESH_MS = 60 * 1000;
// Never wait longer than this for the next open / close change
const MAX_WAIT_MS = 6 * 60 * 60 * 1000;

const ShopStatusContext = createContext({ getShopStatus: () => null, refreshShopStatus: () => {} });

/** Seller id of a product, whether sellerId is an id or a populated seller */
export const sellerIdOf = (product) =>
  String(product?.sellerId?._id || product?.sellerId || product?.seller?._id || product?.seller || "");

/**
 * Open / closed state of the shops serving the customer's location.
 * Unknown shops count as open: the server still blocks orders from closed shops.
 */
export const ShopStatusProvider = ({ children }) => {
  const { currentLocation } = useLocation();
  const lat = Number(currentLocation?.latitude);
  const lng = Number(currentLocation?.longitude);
  const [shops, setShops] = useState({});

  const refreshShopStatus = useCallback(async () => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    try {
      const res = await customerApi.getShopStatus({ lat, lng });
      setShops(res.data?.result?.shops || {});
    } catch {
      /* keep the last known state; ordering is still checked by the server */
    }
  }, [lat, lng]);

  useEffect(() => {
    refreshShopStatus();
    const interval = setInterval(refreshShopStatus, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && refreshShopStatus();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshShopStatus]);

  // Flip exactly when the next shop opens or closes instead of waiting for the next poll
  useEffect(() => {
    const now = Date.now();
    const next = Object.values(shops)
      .flatMap((s) => [s.opensAt, s.closesAt])
      .filter(Boolean)
      .map((d) => new Date(d).getTime() - now)
      .filter((ms) => ms > 0 && ms < MAX_WAIT_MS)
      .sort((a, b) => a - b)[0];
    if (next == null) return undefined;
    const timer = setTimeout(refreshShopStatus, next + 1500);
    return () => clearTimeout(timer);
  }, [shops, refreshShopStatus]);

  const getShopStatus = useCallback((sellerId) => (sellerId ? shops[String(sellerId)] || null : null), [shops]);

  const value = useMemo(() => ({ getShopStatus, refreshShopStatus }), [getShopStatus, refreshShopStatus]);
  return <ShopStatusContext.Provider value={value}>{children}</ShopStatusContext.Provider>;
};

export const useShopStatus = () => useContext(ShopStatusContext);

/** Status of the shop selling this product; null when unknown */
export const useProductShopStatus = (product) => {
  const { getShopStatus } = useShopStatus();
  return getShopStatus(sellerIdOf(product));
};
