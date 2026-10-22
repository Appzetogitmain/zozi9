import React from "react";
import ProductExpiryManager from "@shared/components/productExpiry/ProductExpiryManager";
import { adminApi } from "../services/adminApi";

const api = {
  getExpiryProducts: adminApi.getExpiryProducts,
  updateProductExpiry: adminApi.updateProductExpiry,
};

const loadSellers = async () => {
  const res = await adminApi.getSellers();
  const raw = res.data.result ?? res.data.results ?? res.data;
  if (Array.isArray(raw)) return raw;
  return Array.isArray(raw?.items) ? raw.items : [];
};

const ProductExpiry = () => <ProductExpiryManager mode="admin" api={api} loadSellers={loadSellers} />;

export default ProductExpiry;
