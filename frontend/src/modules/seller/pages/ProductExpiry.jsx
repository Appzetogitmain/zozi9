import React from "react";
import ProductExpiryManager from "@shared/components/productExpiry/ProductExpiryManager";
import { sellerApi } from "../services/sellerApi";

const api = {
  getExpiryProducts: sellerApi.getExpiryProducts,
  updateProductExpiry: sellerApi.updateProductExpiry,
};

const ProductExpiry = () => <ProductExpiryManager mode="seller" api={api} />;

export default ProductExpiry;
