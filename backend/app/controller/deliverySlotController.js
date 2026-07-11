import DeliverySlot from "../models/deliverySlot.js";
import moment from "moment-timezone";

// Create a new delivery slot
export const createDeliverySlot = async (req, res) => {
  try {
    const { startTime, endTime, maxOrders, deliveryCharge, isActive } = req.body;

    // Validate inputs
    if (!startTime || !endTime) {
      return res.status(400).json({ error: "startTime and endTime are required" });
    }

    const newSlot = new DeliverySlot({
      startTime,
      endTime,
      maxOrders: maxOrders || 20,
      deliveryCharge: deliveryCharge || 0,
      isActive: isActive !== undefined ? isActive : true,
    });

    await newSlot.save();
    return res.status(201).json({ message: "Delivery slot created successfully", slot: newSlot });
  } catch (error) {
    console.error("Error creating delivery slot:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Get available delivery slots for a specific date
export const getAvailableSlots = async (req, res) => {
  try {
    const { date } = req.query; // Expecting date in YYYY-MM-DD format

    // For now, let's just return all active slots. We'll fix capacity tracking when booking.
    const slots = await DeliverySlot.find({ isActive: true });

    // Filter slots based on capacity and format response
    const availableSlots = slots.map(slot => ({
      ...slot.toObject(),
      id: slot._id,
      slot: `${slot.startTime}-${slot.endTime}`,
      available: slot.bookedOrders < slot.maxOrders,
      remaining: Math.max(0, slot.maxOrders - slot.bookedOrders),
      deliveryCharge: slot.deliveryCharge
    }));

    // If we only want available slots:
    // const filtered = availableSlots.filter(s => s.available);
    
    return res.status(200).json(availableSlots);
  } catch (error) {
    console.error("Error fetching delivery slots:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Update a delivery slot
export const updateDeliverySlot = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updatedSlot = await DeliverySlot.findByIdAndUpdate(id, updates, { new: true });
    if (!updatedSlot) {
      return res.status(404).json({ error: "Delivery slot not found" });
    }

    return res.status(200).json({ message: "Delivery slot updated successfully", slot: updatedSlot });
  } catch (error) {
    console.error("Error updating delivery slot:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Delete a delivery slot
export const deleteDeliverySlot = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedSlot = await DeliverySlot.findByIdAndDelete(id);
    if (!deletedSlot) {
      return res.status(404).json({ error: "Delivery slot not found" });
    }

    return res.status(200).json({ message: "Delivery slot deleted successfully" });
  } catch (error) {
    console.error("Error deleting delivery slot:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
