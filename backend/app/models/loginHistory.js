import mongoose from "mongoose";

const loginHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'role'
    },
    role: {
      type: String,
      required: true,
      enum: ["Seller", "Delivery", "Admin", "Customer"], // Supporting future scalability
    },
    ipAddress: {
      type: String,
    },
    deviceInfo: {
      type: String,
    }
  },
  { timestamps: true }
);

export default mongoose.model("LoginHistory", loginHistorySchema);
