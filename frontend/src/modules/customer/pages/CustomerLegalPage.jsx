import React, { useState, useEffect } from 'react';
import { ChevronLeft, ScrollText, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import LegalContent, { formatLegalDate } from '@shared/components/legal/LegalContent';
import { customerApi } from '../services/customerApi';

const PAGES = {
    PRIVACY: { title: 'Privacy Policy', icon: ShieldCheck, empty: 'The privacy policy is not available at the moment.' },
    TERMS: { title: 'Terms & Conditions', icon: ScrollText, empty: 'The terms and conditions are not available at the moment.' },
};

/** Customer Terms / Privacy page; the content is written by the admin in Legal Pages */
const CustomerLegalPage = ({ type }) => {
    const navigate = useNavigate();
    const page = PAGES[type];
    const Icon = page.icon;
    const [content, setContent] = useState('');
    const [updatedAt, setUpdatedAt] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        customerApi
            .getLegalPage('CUSTOMER', type)
            .then((res) => {
                if (cancelled || !res.data?.success) return;
                setContent(res.data.result?.content || '');
                setUpdatedAt(res.data.result?.updatedAt || null);
            })
            .catch((err) => console.error(`Failed to fetch ${page.title}:`, err))
            .finally(() => !cancelled && setIsLoading(false));
        return () => {
            cancelled = true;
        };
    }, [type, page.title]);

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-10">
            {/* Header */}
            <div className="bg-white sticky top-0 z-30 px-4 py-3 flex items-center gap-1 shadow-sm">
                <button
                    onClick={() => navigate(-1)}
                    aria-label="Go back"
                    className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors"
                >
                    <ChevronLeft size={24} className="text-slate-600" />
                </button>
                <h1 className="text-lg font-black text-slate-800">{page.title}</h1>
            </div>

            <div className="p-4 sm:p-5 max-w-3xl mx-auto">
                <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="h-12 w-12 shrink-0 rounded-2xl bg-brand-50 flex items-center justify-center text-primary">
                            <Icon size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">{page.title}</h2>
                            {updatedAt && content && (
                                <p className="text-xs text-slate-500 font-medium">Last updated: {formatLegalDate(updatedAt)}</p>
                            )}
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-10">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                        </div>
                    ) : content ? (
                        <LegalContent html={content} />
                    ) : (
                        <p className="text-sm text-slate-500">{page.empty}</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomerLegalPage;
