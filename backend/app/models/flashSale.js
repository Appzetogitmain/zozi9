import mongoose from "mongoose";

export const FLASH_SALE_APPROVAL_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
});

// One product variant offered at a flash price inside a sale.
const flashSaleItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
    },
    variantSku: {
      type: String,
      trim: true,
      default: "",
    },
    variantName: {
      type: String,
      trim: true,
      default: "",
    },
    flashPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    // Units available at the flash price for the whole sale
    totalQuantity: {
      type: Number,
      required: true,
      min: 1,
    },
    // Units already sold at the flash price (released again when an order is cancelled)
    soldQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    // 0 = no per-customer limit
    perCustomerLimit: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: true },
);

const flashSaleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    startAt: {
      type: Date,
      required: true,
    },
    endAt: {
      type: Date,
      required: true,
    },
    createdByRole: {
      type: String,
      enum: ["admin", "seller"],
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    // Set when a seller owns the sale; null for admin-created sales
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      default: null,
    },
    approvalStatus: {
      type: String,
      enum: Object.values(FLASH_SALE_APPROVAL_STATUS),
      default: FLASH_SALE_APPROVAL_STATUS.PENDING,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    // Admin/seller can pause a sale without deleting it
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    items: {
      type: [flashSaleItemSchema],
      default: [],
    },
  },
  { timestamps: true },
);

flashSaleSchema.index({ approvalStatus: 1, isActive: 1, endAt: 1, startAt: 1 });
flashSaleSchema.index({ "items.product": 1, endAt: 1 });
flashSaleSchema.index({ sellerId: 1, createdAt: -1 });

export default mongoose.model("FlashSale", flashSaleSchema);
