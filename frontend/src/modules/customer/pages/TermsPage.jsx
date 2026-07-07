import React, { useState, useEffect } from 'react';
import { ChevronLeft, ScrollText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '@core/context/SettingsContext';
import { customerApi } from '../services/customerApi';

const TermsPage = () => {
    const navigate = useNavigate();
    const { settings } = useSettings();
    const appName = settings?.appName || 'App';
    const companyName = settings?.companyName || appName;
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchTerms = async () => {
            try {
                const res = await customerApi.getLegalPage('CUSTOMER', 'TERMS');
                if (res.data?.success) {
                    setContent(res.data.result?.content || '');
                }
            } catch (err) {
                console.error('Failed to fetch terms:', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchTerms();
    }, []);

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-10">
            {/* Header */}
            <div className="bg-white sticky top-0 z-30 px-4 py-3 flex items-center gap-1 shadow-sm">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors"
                >
                    <ChevronLeft size={24} className="text-slate-600" />
                </button>
                <h1 className="text-lg font-black text-slate-800">Terms & Conditions</h1>
            </div>

            <div className="p-5 max-w-3xl mx-auto space-y-6">
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="h-12 w-12 rounded-2xl bg-brand-50 flex items-center justify-center text-primary">
                            <ScrollText size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Terms of Use</h2>
                            <p className="text-xs text-slate-500 font-medium">Last updated: Oct 2025</p>
                        </div>
                    </div>

                    <div className="prose prose-slate prose-sm max-w-none text-slate-600 space-y-4">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-10">
                                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                            </div>
                        ) : content ? (
                            <div dangerouslySetInnerHTML={{ __html: content.replace(/{appName}/g, appName).replace(/{companyName}/g, companyName) }} />
                        ) : (
                            <p>Terms and conditions are not available at the moment.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TermsPage;

