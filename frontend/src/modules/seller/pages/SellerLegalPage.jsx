import React, { useState, useEffect } from 'react';
import { ShieldCheck, ScrollText } from 'lucide-react';
import { sellerApi } from '../services/sellerApi';
import DashboardLayout from '@shared/layout/DashboardLayout';

const SellerLegalPage = ({ type }) => {
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchContent = async () => {
            setIsLoading(true);
            try {
                const res = await sellerApi.getLegalPage('SELLER', type);
                if (res.data?.success) {
                    setContent(res.data.result?.content || '');
                }
            } catch (err) {
                console.error(`Failed to fetch seller ${type}:`, err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchContent();
    }, [type]);

    const title = type === 'TERMS' ? 'Terms & Conditions' : 'Privacy Policy';
    const Icon = type === 'TERMS' ? ScrollText : ShieldCheck;

    return (
        <DashboardLayout title={title}>
            <div className="max-w-4xl mx-auto py-3">
                <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-100">
                        <div className="h-10 w-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                            <Icon size={28} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-800">{title}</h1>
                            <p className="text-sm text-slate-500 font-medium mt-1">For Seller Partners</p>
                        </div>
                    </div>

                    <div className="prose prose-slate max-w-none text-slate-600 space-y-4 min-h-[400px]">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="animate-spin rounded-full h-10 w-10 border-2 border-indigo-600 border-t-transparent" />
                            </div>
                        ) : content ? (
                            <div dangerouslySetInnerHTML={{ __html: content }} />
                        ) : (
                            <div className="text-center py-20 text-slate-500">
                                <p>{title} is not available at the moment.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
};

export default SellerLegalPage;
