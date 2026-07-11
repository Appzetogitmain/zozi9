import React, { useState, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Modal from '@shared/components/ui/Modal';
import {
    Clock,
    Plus,
    Edit3,
    Trash2,
    Save,
    CalendarClock,
    Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { adminApi } from '../services/adminApi';

const TimeSlotsManagement = () => {
    const { showToast } = useToast();
    const [slots, setSlots] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingSlotId, setEditingSlotId] = useState(null);

    const [newSlot, setNewSlot] = useState({
        startTime: '',
        endTime: '',
        maxOrders: 20
    });

    useEffect(() => {
        fetchSlots();
    }, []);

    const fetchSlots = async () => {
        setIsLoading(true);
        try {
            const response = await adminApi.getDeliverySlots();
            const data = response.data?.result || response.data || [];
            // Sort by start time
            const sortedData = (Array.isArray(data) ? data : []).sort((a, b) => a.startTime.localeCompare(b.startTime));
            setSlots(sortedData);
        } catch (error) {
            showToast('Failed to fetch delivery slots', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveSlot = async (e) => {
        e.preventDefault();
        try {
            if (editingSlotId) {
                await adminApi.updateDeliverySlot(editingSlotId, newSlot);
                showToast('Time slot updated successfully', 'success');
            } else {
                await adminApi.createDeliverySlot(newSlot);
                showToast('Time slot created successfully', 'success');
            }
            fetchSlots();
            setIsAddModalOpen(false);
            setEditingSlotId(null);
            setNewSlot({ startTime: '', endTime: '', maxOrders: 20 });
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to save time slot', 'error');
        }
    };

    const handleEditClick = (slot) => {
        setNewSlot({
            startTime: slot.startTime,
            endTime: slot.endTime,
            maxOrders: slot.maxOrders
        });
        setEditingSlotId(slot._id);
        setIsAddModalOpen(true);
    };

    const handleDeleteSlot = async (id) => {
        if (!window.confirm('Are you sure you want to delete this time slot?')) return;
        try {
            await adminApi.deleteDeliverySlot(id);
            fetchSlots();
            showToast('Time slot deleted successfully', 'warning');
        } catch (error) {
            showToast('Failed to delete time slot', 'error');
        }
    };

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3">
                        Time Slots Management
                        <div className="p-2 bg-indigo-100 rounded-xl">
                            <CalendarClock className="h-5 w-5 text-indigo-600" />
                        </div>
                    </h1>
                    <p className="ds-description mt-1">Configure scheduled delivery time slots for customers.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            setEditingSlotId(null);
                            setNewSlot({ startTime: '', endTime: '', maxOrders: 20 });
                            setIsAddModalOpen(true);
                        }}
                        className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-2xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg active:scale-95 shadow-indigo-200"
                    >
                        <Plus className="h-4 w-4" />
                        CREATE SLOT
                    </button>
                </div>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <AnimatePresence mode="popLayout">
                    {slots.map((slot) => (
                        <motion.div
                            key={slot._id}
                            layout
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                        >
                            <Card className="p-5 border-none shadow-sm ring-1 ring-slate-100 bg-white hover:ring-indigo-200 transition-all text-left">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                                        <Clock className="h-5 w-5" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleEditClick(slot)}
                                            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                        >
                                            <Edit3 className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteSlot(slot._id)}
                                            className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-1 mb-4">
                                    <h3 className="text-xl font-black text-slate-900">
                                        {slot.startTime} - {slot.endTime}
                                    </h3>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        Time Window
                                    </p>
                                </div>
                                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                    <div className="flex items-center gap-2 text-slate-500">
                                        <Users className="h-4 w-4" />
                                        <span className="text-xs font-bold">Capacity</span>
                                    </div>
                                    <Badge variant="outline" className="bg-slate-50 border-slate-200 text-slate-600 font-black">
                                        {slot.maxOrders} Orders
                                    </Badge>
                                </div>
                            </Card>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {slots.length === 0 && !isLoading && (
                <div className="mt-12 text-center p-12 bg-white ring-1 ring-slate-100 rounded-2xl shadow-sm">
                    <CalendarClock className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                    <h3 className="text-lg font-black text-slate-900 mb-2">No Time Slots Configured</h3>
                    <p className="text-slate-500 text-sm font-medium">Create your first delivery time slot to enable scheduled deliveries.</p>
                </div>
            )}

            <Modal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                title={editingSlotId ? "Edit Time Slot" : "Create Time Slot"}
                size="md"
            >
                <form onSubmit={handleSaveSlot} className="space-y-6 text-left">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Start Time</label>
                            <input
                                type="time"
                                required
                                value={newSlot.startTime}
                                onChange={(e) => setNewSlot({ ...newSlot, startTime: e.target.value })}
                                className="w-full px-4 py-3.5 bg-slate-50 border-none rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">End Time</label>
                            <input
                                type="time"
                                required
                                value={newSlot.endTime}
                                onChange={(e) => setNewSlot({ ...newSlot, endTime: e.target.value })}
                                className="w-full px-4 py-3.5 bg-slate-50 border-none rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-sm"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Order Capacity</label>
                        <input
                            type="number"
                            required
                            min="1"
                            value={newSlot.maxOrders}
                            onChange={(e) => setNewSlot({ ...newSlot, maxOrders: parseInt(e.target.value) || '' })}
                            placeholder="e.g. 20"
                            className="w-full px-4 py-3.5 bg-slate-50 border-none rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-sm"
                        />
                        <p className="text-xs font-bold text-slate-500 mt-2">Maximum number of orders allowed for this time slot.</p>
                    </div>
                    <div className="flex gap-4">
                        <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs font-bold uppercase tracking-widest hover:bg-slate-200 transition-all">CANCEL</button>
                        <button type="submit" className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs font-bold uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-2">
                            <Save className="h-4 w-4" /> SAVE SLOT
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default TimeSlotsManagement;
