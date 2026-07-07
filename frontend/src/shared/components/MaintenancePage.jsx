import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, RefreshCw, PhoneCall } from 'lucide-react';

const MaintenancePage = ({ config }) => {
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        if (!config?.estimatedEndTime) return;

        const updateTimer = () => {
            const end = new Date(config.estimatedEndTime).getTime();
            const now = new Date().getTime();
            const distance = end - now;

            if (distance < 0) {
                setTimeLeft('Checking status...');
                // Auto-refresh when time is up
                setTimeout(() => window.location.reload(), 5000);
                return;
            }

            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            setTimeLeft(`${hours > 0 ? hours + 'h ' : ''}${minutes}m ${seconds}s`);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [config?.estimatedEndTime]);

    return (
        <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center p-6 font-['Outfit',_sans-serif]">
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border border-gray-100"
            >
                <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Settings className="w-10 h-10 text-indigo-500 animate-[spin_4s_linear_infinite]" />
                </div>
                
                <h1 className="text-2xl font-black text-slate-800 mb-3">
                    {config?.title || 'Scheduled Maintenance'}
                </h1>
                
                <p className="text-slate-500 mb-8 leading-relaxed">
                    {config?.message || 'We are currently upgrading our systems to serve you better. Please check back soon.'}
                </p>

                {config?.estimatedEndTime && (
                    <div className="bg-slate-50 rounded-2xl p-6 mb-8 border border-slate-100">
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Estimated Time Remaining
                        </p>
                        <div className="text-3xl font-black text-indigo-600 tabular-nums">
                            {timeLeft}
                        </div>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                    <button 
                        onClick={() => window.location.reload()}
                        className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition active:scale-95"
                    >
                        <RefreshCw size={18} />
                        Refresh
                    </button>
                    <button 
                        onClick={() => window.location.href = "mailto:support@example.com"}
                        className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition active:scale-95"
                    >
                        <PhoneCall size={18} />
                        Contact Support
                    </button>
                </div>
            </motion.div>
            
            <p className="mt-8 text-slate-400 text-sm font-medium">
                Protected by Appzeto Security
            </p>
        </div>
    );
};

export default MaintenancePage;
