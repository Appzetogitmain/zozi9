import React, { useState, useEffect } from 'react';
import { Download, TrendingUp, Search, Calendar, FileText, Package } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../services/adminApi';

const ProductSalesReport = () => {
    const [reports, setReports] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [statusType, setStatusType] = useState('delivered');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchReports();

        // Poll for live data every 15 seconds
        const intervalId = setInterval(() => {
            fetchReports(false);
        }, 15000);

        return () => clearInterval(intervalId);
    }, [statusType, startDate, endDate]);

    const fetchReports = async (showLoader = true) => {
        try {
            if (showLoader) setIsLoading(true);
            const params = { statusType };
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;
            
            const res = await adminApi.getProductSalesReport(params);
            if (res.data?.success) {
                const payload = res.data.result || res.data.results || [];
                setReports(payload);
            }
        } catch (error) {
            toast.error('Failed to fetch product sales report');
        } finally {
            setIsLoading(false);
        }
    };

    const downloadCSV = () => {
        if (reports.length === 0) {
            toast.error("No data to export");
            return;
        }

        const headers = ["Product Name", "Category", "Quantity Sold", "Total Revenue"];
        const csvRows = [headers.join(",")];

        for (const item of reports) {
            const values = [
                `"${item.productName?.replace(/"/g, '""') || 'Unknown'}"`,
                `"${item.category?.name || 'N/A'}"`,
                item.totalQuantity,
                item.totalRevenue.toFixed(2)
            ];
            csvRows.push(values.join(","));
        }

        const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Product_Sales_${statusType}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const filteredReports = reports.filter(item => 
        (item.productName || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalRevenueSum = reports.reduce((acc, curr) => acc + curr.totalRevenue, 0);
    const totalItemsSold = reports.reduce((acc, curr) => acc + curr.totalQuantity, 0);

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <TrendingUp className="w-6 h-6 text-indigo-600" />
                        Product Sales Report
                    </h1>
                    <p className="text-gray-500 mt-1">Analyze product performance and sales metrics</p>
                </div>
                
                <button
                    onClick={downloadCSV}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm shadow-sm"
                >
                    <Download className="w-4 h-4" />
                    Export CSV
                </button>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center gap-4">
                    <div className="p-3 bg-green-50 text-green-600 rounded-lg">
                        <TrendingUp className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">Total Revenue</p>
                        <h3 className="text-2xl font-bold text-gray-900">₹{totalRevenueSum.toFixed(2)}</h3>
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center gap-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                        <Package className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">Total Units Sold</p>
                        <h3 className="text-2xl font-bold text-gray-900">{totalItemsSold} Units</h3>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filters */}
                <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/50">
                    <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-lg w-full md:w-auto">
                        <button
                            onClick={() => setStatusType('delivered')}
                            className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                statusType === 'delivered' 
                                    ? 'bg-white text-gray-900 shadow-sm' 
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Delivered Sales
                        </button>
                        <button
                            onClick={() => setStatusType('pending')}
                            className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                statusType === 'pending' 
                                    ? 'bg-white text-gray-900 shadow-sm' 
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Pending/In-Transit
                        </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        <div className="flex items-center gap-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <input 
                                type="date" 
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                className="outline-none bg-transparent"
                            />
                            <span className="text-gray-300">to</span>
                            <input 
                                type="date" 
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                className="outline-none bg-transparent"
                            />
                        </div>

                        <div className="relative flex-1 md:w-64">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="w-4 h-4 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                placeholder="Search products..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm"
                            />
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto min-h-[400px]">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-64">
                            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                            <p className="mt-4 text-gray-500 font-medium">Generating report...</p>
                        </div>
                    ) : filteredReports.length === 0 ? (
                        <div className="text-center p-12">
                            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-900">No data found</h3>
                            <p className="text-gray-500 mt-1">There are no sales records matching your criteria.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-100">
                                    <th className="p-4 font-medium">Product Name</th>
                                    <th className="p-4 font-medium">Category</th>
                                    <th className="p-4 font-medium text-right">Quantity Sold</th>
                                    <th className="p-4 font-medium text-right">Total Revenue</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                                {filteredReports.map((item) => (
                                    <tr key={item._id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                {item.productImage ? (
                                                    <img src={item.productImage} alt={item.productName} className="w-10 h-10 rounded-lg object-cover bg-gray-100" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                                                        <Package className="w-5 h-5" />
                                                    </div>
                                                )}
                                                <div className="font-medium text-gray-900 max-w-xs truncate" title={item.productName}>
                                                    {item.productName}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-gray-600">
                                            {item.category?.name || 'Uncategorized'}
                                        </td>
                                        <td className="p-4 font-medium text-gray-900 text-right">
                                            {item.totalQuantity}
                                        </td>
                                        <td className="p-4 font-semibold text-green-600 text-right">
                                            ₹{item.totalRevenue.toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductSalesReport;
