import React, { useState, useEffect } from 'react';
import { adminApi } from '../services/adminApi';
import { History, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const LoginHistory = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [roleFilter, setRoleFilter] = useState('Seller'); // default to Seller
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    useEffect(() => {
        fetchLoginHistory();
    }, [roleFilter, page]);

    const fetchLoginHistory = async () => {
        setLoading(true);
        try {
            const res = await adminApi.getLoginHistory({
                role: roleFilter,
                page,
                limit: 20
            });
            if (res.data?.success) {
                const payload = res.data.result || res.data.results || {};
                setLogs(payload.loginHistory || []);
                setTotalPages(payload.totalPages || 1);
            }
        } catch (error) {
            toast.error('Failed to fetch login history');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <History className="w-6 h-6 text-indigo-600" />
                        Login History
                    </h1>
                    <p className="text-gray-500 mt-1">Track authentication events for Sellers and Delivery Personnel</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/50">
                    <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-full sm:w-auto">
                        <button
                            onClick={() => { setRoleFilter('Seller'); setPage(1); }}
                            className={`flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-all ${
                                roleFilter === 'Seller' 
                                    ? 'bg-white text-indigo-600 shadow-sm' 
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Sellers
                        </button>
                        <button
                            onClick={() => { setRoleFilter('Delivery'); setPage(1); }}
                            className={`flex-1 sm:flex-none px-6 py-2 rounded-md text-sm font-medium transition-all ${
                                roleFilter === 'Delivery' 
                                    ? 'bg-white text-indigo-600 shadow-sm' 
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Delivery Partners
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="flex justify-center items-center p-12">
                            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="text-center p-12">
                            <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-900">No login records found</h3>
                            <p className="text-gray-500 mt-1">There are no recent login events for the selected role.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-100">
                                    <th className="p-4 font-medium">User</th>
                                    <th className="p-4 font-medium">Role</th>
                                    <th className="p-4 font-medium">Login Time</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                                {logs.map((log) => (
                                    <tr key={log._id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="p-4">
                                            <div className="font-medium text-gray-900">
                                                {log.userId?.name || 'Unknown User'}
                                            </div>
                                            <div className="text-gray-500 text-xs mt-0.5">
                                                {log.userId?.email || log.userId?.phone}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                                                log.role === 'Seller' 
                                                    ? 'bg-purple-100 text-purple-700' 
                                                    : 'bg-emerald-100 text-emerald-700'
                                            }`}>
                                                {log.role}
                                            </span>
                                        </td>
                                        <td className="p-4 text-gray-600 whitespace-nowrap">
                                            {new Date(log.createdAt).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                
                {!loading && totalPages > 1 && (
                    <div className="p-4 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-sm text-gray-500">
                            Page {page} of {totalPages}
                        </span>
                        <div className="flex gap-2">
                            <button
                                disabled={page === 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                className="px-4 py-2 border border-gray-200 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Previous
                            </button>
                            <button
                                disabled={page === totalPages}
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                className="px-4 py-2 border border-gray-200 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LoginHistory;
