import React, { useState, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import { useToast } from '@shared/components/ui/Toast';
import { adminApi } from '../services/adminApi';
import { HiOutlineDocumentText } from 'react-icons/hi2';

const AdminLegalPages = () => {
    const { showToast } = useToast();
    const [role, setRole] = useState('CUSTOMER');
    const [type, setType] = useState('TERMS');
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchContent();
    }, [role, type]);

    const fetchContent = async () => {
        setIsLoading(true);
        try {
            const res = await adminApi.getLegalPage(role, type);
            if (res.data.success) {
                setContent(res.data.result?.content || '');
            } else {
                setContent('');
            }
        } catch (error) {
            console.error('Error fetching legal page:', error);
            setContent('');
            showToast('Failed to load content', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await adminApi.updateLegalPage(role, type, { content });
            if (res.data.success) {
                showToast('Content updated successfully', 'success');
            }
        } catch (error) {
            console.error('Error updating legal page:', error);
            showToast('Failed to save content', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                    <h1 className="ds-h1 flex items-center gap-3">
                        Legal Pages
                    </h1>
                    <p className="ds-description">Manage Terms & Conditions and Privacy Policy for all roles.</p>
                </div>
            </div>

            <div className="mt-8 flex flex-col lg:flex-row gap-8">
                {/* Sidebar for Selection */}
                <div className="w-full lg:w-64 shrink-0 space-y-6">
                    <Card className="p-4 bg-white border-slate-100 shadow-sm rounded-2xl">
                        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Select Role</h3>
                        <div className="flex flex-col gap-2">
                            {['CUSTOMER', 'SELLER', 'DELIVERY'].map(r => (
                                <button
                                    key={r}
                                    onClick={() => setRole(r)}
                                    className={`px-4 py-3 rounded-xl text-left text-sm font-bold transition-all ${role === r ? 'bg-primary text-white shadow-md' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                                >
                                    {r.charAt(0) + r.slice(1).toLowerCase()} Panel
                                </button>
                            ))}
                        </div>
                    </Card>

                    <Card className="p-4 bg-white border-slate-100 shadow-sm rounded-2xl">
                        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Select Page</h3>
                        <div className="flex flex-col gap-2">
                            {[
                                { id: 'TERMS', label: 'Terms & Conditions' },
                                { id: 'PRIVACY', label: 'Privacy Policy' }
                            ].map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setType(t.id)}
                                    className={`px-4 py-3 rounded-xl text-left text-sm font-bold transition-all ${type === t.id ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </Card>
                </div>

                {/* Editor Area */}
                <div className="flex-1">
                    <Card className="p-6 bg-white border-slate-100 shadow-lg rounded-2xl h-full flex flex-col">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                    <HiOutlineDocumentText className="h-6 w-6" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-slate-800">
                                        {type === 'TERMS' ? 'Terms & Conditions' : 'Privacy Policy'}
                                    </h2>
                                    <p className="text-xs font-bold text-slate-500">
                                        For {role.charAt(0) + role.slice(1).toLowerCase()}s
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleSave}
                                disabled={isSaving || isLoading}
                                className="px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-md hover:bg-primary/90 disabled:opacity-50 transition-all"
                            >
                                {isSaving ? 'Saving...' : 'Save Content'}
                            </button>
                        </div>

                        {isLoading ? (
                            <div className="flex-1 flex items-center justify-center min-h-[400px]">
                                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col">
                                <p className="text-xs text-slate-500 mb-2">You can use basic HTML tags for formatting (e.g., &lt;h3&gt;, &lt;p&gt;, &lt;strong&gt;, &lt;br/&gt;)</p>
                                <textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    className="flex-1 w-full min-h-[400px] p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-sm text-slate-700 font-mono"
                                    placeholder="Enter your content here..."
                                />
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default AdminLegalPages;
