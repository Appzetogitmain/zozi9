// Premium Billing & Financial Configuration System
import React, { useState, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import {
    RotateCcw,
    Save,
    Info,
    Truck,
    Settings,
    Zap,
    MapPin,
    History
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';
import { adminApi } from '../services/adminApi';

const BillingCharges = () => {
    const { showToast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [deliveryMode, setDeliveryMode] = useState('distance'); // 'fixed' or 'distance'
    const [returnDeliveryCommission, setReturnDeliveryCommission] = useState(0);

    const [config, setConfig] = useState({
        platformFee: 0,
        freeDeliveryThreshold: 0,
        baseCharge: 30,
        baseDistance: 0.5,
        extraPerKm: 10,
        fixedCharge: 30,
        handlingFeeStrategy: "highest_category_fee",
        codEnabled: true,
        onlineEnabled: true,
        // Delivery Partner Route Earning
        riderBaseFare: 20,
        riderIncludedKm: 2,
        riderExtraKmRate: 8,
        riderSurgeMultiplier: 1.0,
    });

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const [platformRes, deliveryRes] = await Promise.all([
                    adminApi.getPlatformSettings(),
                    adminApi.getDeliveryFinanceSettings(),
                ]);

                if (platformRes.data?.success && platformRes.data.result) {
                    setReturnDeliveryCommission(platformRes.data.result.returnDeliveryCommission ?? 0);
                }

                if (deliveryRes.data?.success && deliveryRes.data.result) {
                    const s = deliveryRes.data.result;
                    setDeliveryMode(s.deliveryPricingMode === 'fixed_price' ? 'fixed' : 'distance');
                    setConfig((prev) => ({
                        ...prev,
                        baseCharge: s.customerBaseDeliveryFee ?? s.baseDeliveryCharge ?? prev.baseCharge,
                        baseDistance: s.baseDistanceCapacityKm ?? prev.baseDistance,
                        extraPerKm: s.incrementalKmSurcharge ?? prev.extraPerKm,
                        fixedCharge: s.fixedDeliveryFee ?? s.customerBaseDeliveryFee ?? prev.fixedCharge,
                        handlingFeeStrategy: s.handlingFeeStrategy ?? prev.handlingFeeStrategy,
                        codEnabled: s.codEnabled ?? prev.codEnabled,
                        onlineEnabled: s.onlineEnabled ?? prev.onlineEnabled,
                        riderBaseFare: s.riderBaseFare ?? s.riderBasePayout ?? prev.riderBaseFare,
                        riderIncludedKm: s.riderIncludedKm ?? prev.riderIncludedKm,
                        riderExtraKmRate: s.riderExtraKmRate ?? s.deliveryPartnerRatePerKm ?? prev.riderExtraKmRate,
                        riderSurgeMultiplier: s.riderSurgeMultiplier ?? prev.riderSurgeMultiplier,
                    }));
                }
            } catch (error) {
                console.error('Failed to load settings', error);
            }
        };
        fetchSettings();
    }, []);

    const handleSave = async () => {
        try {
            setIsSaving(true);
            await Promise.all([
                adminApi.updatePlatformSettings({
                    returnDeliveryCommission,
                }),
                adminApi.updateDeliveryFinanceSettings({
                    deliveryPricingMode: deliveryMode === 'fixed' ? 'fixed_price' : 'distance_based',
                    customerBaseDeliveryFee: config.baseCharge,
                    baseDeliveryCharge: config.baseCharge,
                    baseDistanceCapacityKm: config.baseDistance,
                    incrementalKmSurcharge: config.extraPerKm,
                    fixedDeliveryFee: config.fixedCharge,
                    handlingFeeStrategy: config.handlingFeeStrategy,
                    codEnabled: config.codEnabled,
                    onlineEnabled: config.onlineEnabled,
                    riderBaseFare: config.riderBaseFare,
                    riderBasePayout: config.riderBaseFare,
                    riderIncludedKm: config.riderIncludedKm,
                    riderExtraKmRate: config.riderExtraKmRate,
                    deliveryPartnerRatePerKm: config.riderExtraKmRate,
                    fleetCommissionRatePerKm: config.riderExtraKmRate,
                    riderSurgeMultiplier: config.riderSurgeMultiplier,
                }),
            ]);

            showToast('Delivery finance settings updated', 'success');
        } catch (error) {
            console.error('Failed to update platform settings', error);
            showToast('Failed to update fees settings', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputChange = (field, value) => {
        setConfig(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
    };

    // Calculate sample delivery earning for 5 km route
    const sampleRouteKm = 5.0;
    const sampleExtraKm = Math.max(0, sampleRouteKm - (config.riderIncludedKm || 0));
    const sampleDistanceFare = sampleExtraKm * (config.riderExtraKmRate || 0);
    const sampleTotalEarning = ((config.riderBaseFare || 0) + sampleDistanceFare) * (config.riderSurgeMultiplier || 1);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1">
                <div>
                    <h1 className="admin-h1 flex items-center gap-3">
                        Fees & Charges
                        <div className="p-2 bg-red-100 rounded-xl">
                            <RotateCcw className="h-5 w-5 text-red-600" />
                        </div>
                    </h1>
                    <p className="admin-description mt-1">Set up customer delivery fees, delivery partner route earnings, and platform charges.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-5 py-3 bg-white ring-1 ring-slate-200 text-slate-700 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm">
                        <History className="h-4 w-4 text-slate-500" />
                        AUDIT LOGS
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={cn(
                            "flex items-center gap-2 px-6 py-3 bg-black text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-brand-100 active:scale-95",
                            isSaving ? "opacity-70 cursor-wait" : "hover:bg-brand-700"
                        )}
                    >
                        {isSaving ? (
                            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Save className="h-4 w-4" />
                        )}
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>


            <div className="max-w-4xl mx-auto text-left">
                {/* Main Configuration Core */}
                <div className="space-y-8">
                    {/* General Financial Thresholds */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-[32px] overflow-hidden">
                        <div className="p-6 border-b border-slate-50 bg-slate-50/30">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                <Settings className="h-4 w-4 text-slate-500" />
                                Main Charges
                            </h3>
                        </div>
                        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-3">
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    Platform/Handling Fee (₹)
                                    <Info className="h-3 w-3 opacity-50" />
                                </label>
                                <div className="relative group">
                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-400 group-focus-within:text-red-700 transition-colors">₹</span>
                                    <input
                                        type="number"
                                        value={config.platformFee}
                                        onChange={(e) => handleInputChange('platformFee', e.target.value)}
                                        className="w-full pl-10 pr-5 py-4 bg-slate-50 border-none rounded-2xl text-base font-black text-slate-900 outline-none focus:ring-2 focus:ring-red-500/10 transition-all"
                                    />
                                </div>
                                <p className="text-xs font-bold text-slate-500 italic">Fee added to every order.</p>
                            </div>
                            <div className="space-y-3">
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    Free Delivery Minimum (₹)
                                    <Zap className="h-3 w-3 text-amber-700" />
                                </label>
                                <div className="relative group">
                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-400 group-focus-within:text-red-700 transition-colors">₹</span>
                                    <input
                                        type="number"
                                        value={config.freeDeliveryThreshold}
                                        onChange={(e) => handleInputChange('freeDeliveryThreshold', e.target.value)}
                                        className="w-full pl-10 pr-5 py-4 bg-slate-50 border-none rounded-2xl text-base font-black text-slate-900 outline-none focus:ring-2 focus:ring-red-500/10 transition-all"
                                    />
                                </div>
                                <p className="text-xs font-bold text-slate-500 italic">Orders above this amount will have free delivery.</p>
                            </div>
                        </div>
                    </Card>

                    {/* Customer Delivery Fee Settings */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-[32px] overflow-hidden">
                        <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                <Truck className="h-4 w-4 text-brand-500" />
                                Customer Delivery Fee Settings
                            </h3>
                            <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
                                <button
                                    onClick={() => setDeliveryMode('fixed')}
                                    className={cn("px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all", deliveryMode === 'fixed' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                                >Fixed Price</button>
                                <button
                                    onClick={() => setDeliveryMode('distance')}
                                    className={cn("px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all", deliveryMode === 'distance' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                                >Distance Based</button>
                            </div>
                        </div>
                        <div className="p-8">
                            {deliveryMode === 'distance' ? (
                                <>
                                    <div className="bg-brand-50 border border-brand-100 rounded-2xl p-4 mb-8 flex gap-4">
                                        <MapPin className="h-5 w-5 text-brand-500 shrink-0 mt-0.5" />
                                        <div className="space-y-1">
                                            <p className="text-xs font-black text-brand-900 uppercase tracking-tight">Location Accuracy</p>
                                            <p className="text-xs font-bold text-brand-700 leading-relaxed italic">Requires Google Maps API. Without it, the system will use straight-line distance.</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3">
                                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Base Delivery Charge (₹)</label>
                                            <input
                                                type="number"
                                                value={config.baseCharge}
                                                onChange={(e) => handleInputChange('baseCharge', e.target.value)}
                                                className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                            />
                                            <p className="text-xs font-bold text-slate-500 italic">Customer-facing minimum fee for first X kms.</p>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Base Distance Capacity (km)</label>
                                            <div className="relative group">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={config.baseDistance}
                                                    onChange={(e) => handleInputChange('baseDistance', e.target.value)}
                                                    className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                                />
                                                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 uppercase">km</span>
                                            </div>
                                            <p className="text-xs font-bold text-slate-500 italic">Radius covered by customer base charge.</p>
                                        </div>
                                        <div className="space-y-3 md:col-span-2">
                                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Incremental Km Surcharge (₹)</label>
                                            <input
                                                type="number"
                                                value={config.extraPerKm}
                                                onChange={(e) => handleInputChange('extraPerKm', e.target.value)}
                                                className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                            />
                                            <p className="text-xs font-bold text-slate-500 italic">Charged to customer for every km beyond base radius.</p>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-6">
                                    <div className="space-y-3">
                                        <label className="text-base font-bold text-slate-900">Fixed Delivery Charge (₹)</label>
                                        <div className="relative group max-w-md">
                                            <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-400 group-focus-within:text-slate-900 transition-colors">₹</span>
                                            <input
                                                type="number"
                                                value={config.fixedCharge}
                                                onChange={(e) => handleInputChange('fixedCharge', e.target.value)}
                                                className="w-full pl-10 pr-5 py-4 bg-white ring-1 ring-slate-200 border-none rounded-xl text-base font-medium text-slate-900 outline-none focus:ring-2 focus:ring-slate-900/10 transition-all"
                                            />
                                        </div>
                                        <p className="text-sm font-medium text-slate-500">Flat fee charged for all deliveries below threshold.</p>
                                    </div>
                                </div>
                            )}

                            <div className="mt-8 pt-6 border-t border-dashed border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                                        Return Delivery Commission (per pickup)
                                    </label>
                                    <div className="relative group max-w-md">
                                        <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-400 group-focus-within:text-slate-900 transition-colors">₹</span>
                                        <input
                                            type="number"
                                            min="0"
                                            value={returnDeliveryCommission}
                                            onChange={(e) =>
                                                setReturnDeliveryCommission(Number(e.target.value) || 0)
                                            }
                                            className="w-full pl-10 pr-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all"
                                        />
                                    </div>
                                    <p className="text-xs font-bold text-slate-500">
                                        Flat amount paid to delivery partner for each approved return pickup (deducted from seller earnings).
                                    </p>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Delivery Partner Route Earning Configuration */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-[32px] overflow-hidden">
                        <div className="p-6 border-b border-slate-50 bg-gradient-to-r from-emerald-50/50 via-teal-50/30 to-transparent flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                                        <Truck className="h-4 w-4" />
                                    </div>
                                    Delivery Partner Earning (Route Based)
                                </h3>
                                <p className="text-xs text-slate-500 font-medium mt-1">
                                    Earnings are calculated based on actual road route from Seller to Customer.
                                </p>
                            </div>
                            <div className="hidden sm:flex items-center gap-2 bg-emerald-50 text-emerald-800 px-3.5 py-1.5 rounded-full border border-emerald-200/60 text-xs font-black">
                                <span>Formula: (Base + Extra Km × Rate) × Surge</span>
                            </div>
                        </div>
                        <div className="p-8 space-y-8">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                <div className="space-y-3">
                                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                                        Rider Base Fare (₹)
                                    </label>
                                    <div className="relative group">
                                        <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-400 group-focus-within:text-emerald-700 transition-colors">₹</span>
                                        <input
                                            type="number"
                                            min="0"
                                            value={config.riderBaseFare}
                                            onChange={(e) => handleInputChange('riderBaseFare', e.target.value)}
                                            className="w-full pl-10 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all"
                                        />
                                    </div>
                                    <p className="text-xs font-bold text-slate-500 italic">Base earning for first X km.</p>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                                        Included Distance (km)
                                    </label>
                                    <div className="relative group">
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            value={config.riderIncludedKm}
                                            onChange={(e) => handleInputChange('riderIncludedKm', e.target.value)}
                                            className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all"
                                        />
                                        <span className="absolute right-5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 uppercase">km</span>
                                    </div>
                                    <p className="text-xs font-bold text-slate-500 italic">Covered by base fare.</p>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                                        Extra KM Rate (₹/km)
                                    </label>
                                    <div className="relative group">
                                        <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-400 group-focus-within:text-emerald-700 transition-colors">₹</span>
                                        <input
                                            type="number"
                                            min="0"
                                            value={config.riderExtraKmRate}
                                            onChange={(e) => handleInputChange('riderExtraKmRate', e.target.value)}
                                            className="w-full pl-10 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all"
                                        />
                                    </div>
                                    <p className="text-xs font-bold text-slate-500 italic">For distance beyond base km.</p>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                                        Surge Multiplier (x)
                                    </label>
                                    <div className="relative group">
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="1.0"
                                            value={config.riderSurgeMultiplier}
                                            onChange={(e) => handleInputChange('riderSurgeMultiplier', e.target.value)}
                                            className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all"
                                        />
                                        <span className="absolute right-5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 uppercase">x</span>
                                    </div>
                                    <p className="text-xs font-bold text-slate-500 italic">1.0 = Normal (1.2 = 20% peak).</p>
                                </div>
                            </div>

                            {/* Real-time Calculation Simulator */}
                            <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div>
                                    <span className="text-[11px] font-black uppercase tracking-widest text-emerald-400">Live Simulator (5.0 km Route)</span>
                                    <p className="text-xs text-slate-300 mt-1">
                                        Base: ₹{config.riderBaseFare} ({config.riderIncludedKm} km) + Extra: {sampleExtraKm.toFixed(1)} km × ₹{config.riderExtraKmRate} = ₹{((config.riderBaseFare || 0) + sampleDistanceFare).toFixed(0)} {config.riderSurgeMultiplier > 1 ? `× ${config.riderSurgeMultiplier}x surge` : ''}
                                    </p>
                                </div>
                                <div className="bg-emerald-500/20 border border-emerald-500/40 px-5 py-2.5 rounded-xl text-center flex-shrink-0">
                                    <span className="text-[10px] uppercase font-bold text-emerald-300 block">Rider Receives</span>
                                    <span className="text-xl font-black text-emerald-400">₹{sampleTotalEarning.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default BillingCharges;
