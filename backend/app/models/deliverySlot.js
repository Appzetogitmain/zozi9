import mongoose from "mongoose";

const deliverySlotSchema = new mongoose.Schema(
  {
    startTime: {
      type: String, // HH:mm format (24-hour)
      required: true,
    },
    endTime: {
      type: String, // HH:mm format (24-hour)
      required: true,
    },
    maxOrders: {
      type: Number,
      required: true,
      default: 20,
    },
    bookedOrders: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    deliveryCharge: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Method to check if slot is available
deliverySlotSchema.methods.isAvailable = function () {
  return this.isActive && this.bookedOrders < this.maxOrders;
};

const DeliverySlot = mongoose.model('DeliverySlot', deliverySlotSchema);

export default DeliverySlot;
