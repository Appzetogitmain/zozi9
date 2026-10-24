import mongoose from "mongoose";
import bcrypt from "bcrypt";

const sellerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    shopName: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    address: {
      type: String,
      trim: true,
    },
    locality: {
      type: String,
      trim: true,
    },
    pincode: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },

    documents: {
      tradeLicense: { type: String, trim: true },
      gstCertificate: { type: String, trim: true },
      idProof: { type: String, trim: true },
      businessRegistration: { type: String, trim: true },
      fssaiLicense: { type: String, trim: true },
      other: { type: String, trim: true },
    },

    role: {
      type: String,
      default: "seller",
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    phoneVerified: {
      type: Boolean,
      default: false,
    },

    applicationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    reviewedAt: {
      type: Date,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },

    rejectionReason: {
      type: String,
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: false,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
    serviceRadius: {
      type: Number,
      default: 5, // Default 5km
    },
    // Shop opening / closing (set by the seller or an admin). Times are India time (IST).
    shopTiming: {
      // When off, the shop is open round the clock unless closed manually
      scheduleEnabled: { type: Boolean, default: false },
      weeklyHours: {
        type: [
          new mongoose.Schema(
            {
              day: { type: Number, min: 0, max: 6, required: true }, // 0 = Sunday
              isOpen: { type: Boolean, default: true },
              open: { type: String, default: "09:00" }, // "HH:MM", 24h
              close: { type: String, default: "22:00" }, // earlier than open = closes after midnight
            },
            { _id: false },
          ),
        ],
        default: () =>
          [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, isOpen: true, open: "09:00", close: "22:00" })),
      },
      // Manual switch: "none" follows the schedule, "open" / "closed" overrides it
      override: { type: String, enum: ["none", "open", "closed"], default: "none" },
      // When the manual switch ends by itself (null = until changed again)
      overrideUntil: { type: Date, default: null },
      // Optional message shown to customers while closed, e.g. "On Diwali holiday"
      note: { type: String, trim: true, default: "", maxlength: 120 },
      updatedByRole: { type: String, enum: ["seller", "admin", ""], default: "" },
      updatedAt: { type: Date, default: null },
    },
    lastLogin: Date,
  },
  { timestamps: true },
);

sellerSchema.index({ location: "2dsphere" });
sellerSchema.index({ isActive: 1, isVerified: 1 });

// Hash password before saving
sellerSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
sellerSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model("Seller", sellerSchema);
