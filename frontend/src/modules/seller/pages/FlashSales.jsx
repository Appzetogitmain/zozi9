import React from "react";
import FlashSaleManager from "@shared/components/flashSale/FlashSaleManager";
import { sellerApi } from "../services/sellerApi";

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

const extractList = (res) => {
  const raw = res.data.result ?? res.data.results ?? res.data;
  if (Array.isArray(raw)) return raw;
  return Array.isArray(raw?.items) ? raw.items : [];
};

const api = {
  getFlashSales: sellerApi.getFlashSales,
  createFlashSale: sellerApi.createFlashSale,
  updateFlashSale: sellerApi.updateFlashSale,
  setFlashSaleActive: sellerApi.setFlashSaleActive,
  endFlashSale: sellerApi.endFlashSale,
  deleteFlashSale: sellerApi.deleteFlashSale,
};

// The seller product endpoint has no text search, so load the catalogue once and filter here
let catalogueCache = null;
const loadCatalogue = async () => {
  if (catalogueCache) return catalogueCache;
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const items = extractList(await sellerApi.getProducts({ page, limit: PAGE_SIZE }));
    all.push(...items);
    if (items.length < PAGE_SIZE) break;
  }
  catalogueCache = all.filter((p) => p.status === "active");
  return catalogueCache;
};

const loadProducts = async ({ search }) => {
  const catalogue = await loadCatalogue();
  const q = String(search || "").toLowerCase();
  return q ? catalogue.filter((p) => String(p.name || "").toLowerCase().includes(q)) : catalogue;
};

const FlashSales = () => {
  React.useEffect(() => () => {
    catalogueCache = null;
  }, []);
  return <FlashSaleManager mode="seller" api={api} loadProducts={loadProducts} />;
};

export default FlashSales;
