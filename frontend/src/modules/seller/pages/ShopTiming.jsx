import React from "react";
import ShopTimingEditor from "@shared/components/shopTiming/ShopTimingEditor";
import { sellerApi } from "../services/sellerApi";

const api = {
  get: sellerApi.getShopTiming,
  saveHours: sellerApi.updateShopHours,
  setStatus: sellerApi.setShopStatus,
};

const ShopTiming = () => (
  <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 pb-20 duration-700">
    <div className="mb-6">
      <h1 className="ds-h1">Shop Timings</h1>
      <p className="ds-description">
        Open or close your shop instantly, or set weekly hours so it opens and closes by itself.
      </p>
    </div>
    <ShopTimingEditor api={api} ownerLabel="your shop" />
  </div>
);

export default ShopTiming;
