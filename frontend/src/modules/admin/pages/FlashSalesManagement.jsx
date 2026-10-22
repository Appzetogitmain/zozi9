import React from "react";
import FlashSaleManager from "@shared/components/flashSale/FlashSaleManager";
import { adminApi } from "../services/adminApi";

const extractList = (res) => {
  const raw = res.data.result ?? res.data.results ?? res.data;
  if (Array.isArray(raw)) return raw;
  return Array.isArray(raw?.items) ? raw.items : [];
};

const api = {
  getFlashSales: adminApi.getFlashSales,
  createFlashSale: adminApi.createFlashSale,
  updateFlashSale: adminApi.updateFlashSale,
  reviewFlashSale: adminApi.reviewFlashSale,
  setFlashSaleActive: adminApi.setFlashSaleActive,
  endFlashSale: adminApi.endFlashSale,
  deleteFlashSale: adminApi.deleteFlashSale,
};

const loadSellers = async () => extractList(await adminApi.getSellers());

const loadProducts = async ({ sellerId, search }) => {
  const params = { sellerIds: sellerId, limit: 100, status: "active" };
  if (search) params.search = search;
  return extractList(await adminApi.getProducts(params));
};

const FlashSalesManagement = () => (
  <FlashSaleManager mode="admin" api={api} loadSellers={loadSellers} loadProducts={loadProducts} />
);

export default FlashSalesManagement;
