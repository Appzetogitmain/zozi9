import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, Plus, Trash2, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../services/adminApi';

const MaintenanceMode = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [config, setConfig] = useState({
        enabled: false,
        title: 'Scheduled Maintenance',
        message: 'We are upgrading our servers. Please try again later.',
        estimatedEndTime: '',
        allowedRoles: ['admin'],
        allowedIPs: []
    });

    const [newIp, setNewIp] = useState('');

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await adminApi.getMaintenanceSettings();
            if (res.data?.success) {
                const data = res.data.result;
                setConfig({
                    enabled: data.enabled || false,
                    title: data.title || '',
                    message: data.message || '',
                    estimatedEndTime: data.estimatedEndTime ? new Date(data.estimatedEndTime).toISOString().slice(0, 16) : '',
                    allowedRoles: data.allowedRoles || ['admin'],
                    allowedIPs: data.allowedIPs || []
                });
            }
        } catch (error) {
            toast.error('Failed to load maintenance settings');
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = () => {
        setConfig(prev => ({ ...prev, enabled: !prev.enabled }));
    };

    const handleRoleToggle = (role) => {
        setConfig(prev => {
            const roles = [...prev.allowedRoles];
            if (roles.includes(role)) {
                return { ...prev, allowedRoles: roles.filter(r => r !== role) };
            } else {
                return { ...prev, allowedRoles: [...roles, role] };
            }
        });
    };

    const handleAddIp = () => {
        if (!newIp.trim()) return;
        if (config.allowedIPs.includes(newIp.trim())) {
            toast.error("IP already added");
            return;
        }
        setConfig(prev => ({
            ...prev,
            allowedIPs: [...prev.allowedIPs, newIp.trim()]
        }));
        setNewIp('');
    };

    const handleRemoveIp = (ip) => {
        setConfig(prev => ({
            ...prev,
            allowedIPs: prev.allowedIPs.filter(i => i !== ip)
        }));
    };

    const handleSave = async (isEmergency = false) => {
        setSaving(true);
        try {
            const payload = { ...config };
            if (isEmergency) {
                payload.enabled = true;
                payload.emergencyStop = true;
                payload.title = "Emergency Maintenance";
                payload.message = "System is down for emergency maintenance. Please check back shortly.";
            }

            const res = await adminApi.updateMaintenanceSettings(payload);
            if (res.data?.success) {
                toast.success(isEmergency ? 'Emergency Stop Activated' : 'Maintenance settings updated');
                if (isEmergency) fetchSettings();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-6">Loading maintenance settings...</div>;

    return (
        <div className="p-6 font-['Outfit',_sans-serif] max-w-4xl">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <ShieldAlert className="text-red-700" />
                        Maintenance Mode
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Control platform access during upgrades or emergencies</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Settings */}
                <div className="md:col-span-2 space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-100">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">Status</h2>
                                <p className="text-slate-500 text-sm mt-1">
                                    {config.enabled ? 'Platform is currently offline' : 'Platform is live'}
                                </p>
                            </div>
                            <button
                                onClick={handleToggle}
                                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${config.enabled ? 'bg-red-500' : 'bg-green-500'}`}
                            >
                                <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-7' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Maintenance Title</label>
                                <input
                                    type="text"
                                    value={config.title}
                                    onChange={(e) => setConfig({ ...config, title: e.target.value })}
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Maintenance Message</label>
                                <textarea
                                    rows={3}
                                    value={config.message}
                                    onChange={(e) => setConfig({ ...config, message: e.target.value })}
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Estimated End Time</label>
                                <input
                                    type="datetime-local"
                                    value={config.estimatedEndTime}
                                    onChange={(e) => setConfig({ ...config, estimatedEndTime: e.target.value })}
                                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <h2 className="text-lg font-bold text-slate-800 mb-4">Allowed IP Addresses</h2>
                        <p className="text-slate-500 text-sm mb-4">These IPs can access the platform even when maintenance is enabled.</p>
                        
                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={newIp}
                                onChange={(e) => setNewIp(e.target.value)}
                                placeholder="e.g. 192.168.1.1"
                                className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button
                                onClick={handleAddIp}
                                className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 flex items-center gap-2"
                            >
                                <Plus size={18} /> Add
                            </button>
                        </div>

                        <div className="space-y-2">
                            {config.allowedIPs.map(ip => (
                                <div key={ip} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <span className="text-slate-700 font-mono text-sm">{ip}</span>
                                    <button onClick={() => handleRemoveIp(ip)} className="text-red-700 hover:text-red-600">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                            {config.allowedIPs.length === 0 && (
                                <div className="text-center p-4 text-slate-500 text-sm border border-dashed border-slate-200 rounded-lg">
                                    No IP addresses whitelisted
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <h2 className="text-lg font-bold text-slate-800 mb-4">Who Can Access?</h2>
                        <div className="space-y-3">
                            {['admin', 'seller', 'driver', 'customer'].map(role => (
                                <label key={role} className="flex items-center gap-3 p-3 border border-slate-100 rounded-lg cursor-pointer hover:bg-slate-50 transition">
                                    <input
                                        type="checkbox"
                                        checked={config.allowedRoles.includes(role)}
                                        onChange={() => handleRoleToggle(role)}
                                        disabled={role === 'admin'}
                                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                    />
                                    <span className="text-slate-700 capitalize">{role}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={() => handleSave(false)}
                        disabled={saving}
                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 disabled:opacity-70"
                    >
                        {saving ? 'Saving...' : 'Save Settings'}
                    </button>

                    <div className="bg-red-50 rounded-xl border border-red-200 p-6">
                        <h3 className="text-red-800 font-bold mb-2 flex items-center gap-2">
                            <Power size={18} /> Emergency Shutdown
                        </h3>
                        <p className="text-red-600 text-sm mb-4">Immediately block all users and put the system into emergency maintenance mode.</p>
                        <button
                            onClick={() => {
                                if (window.confirm("Are you sure? This will instantly lock out all users!")) {
                                    handleSave(true);
                                }
                            }}
                            className="w-full py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition"
                        >
                            Enable Emergency Mode
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MaintenanceMode;
