import React, { useState, useEffect } from 'react';
import { adminApi } from '../services/adminApi';
import { Shield, Plus, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const AVAILABLE_MODULES = [
    'Dashboard', 'Categories', 'Products', 'Marketing Tools', 'Customer Support',
    'Sellers', 'Delivery Drivers', 'Wallet', 'Money Requests', 'Seller Payments',
    'Collect Cash', 'Customers', 'FAQs', 'Orders', 'Fees & Charges',
    'Settings', 'Legal Pages', 'System Settings'
];

const RolesManagement = () => {
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState(null);
    const [formData, setFormData] = useState({ name: '', modules: [] });

    useEffect(() => {
        fetchRoles();
    }, []);

    const fetchRoles = async () => {
        try {
            const res = await adminApi.getRoles();
            if (res.data?.success) {
                const payload = res.data.results || res.data.result || res.data.data || [];
                setRoles(Array.isArray(payload) ? payload : []);
            }
        } catch (error) {
            toast.error('Failed to fetch roles');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (role = null) => {
        if (role) {
            setEditingRole(role);
            setFormData({ name: role.name, modules: role.modules || [] });
        } else {
            setEditingRole(null);
            setFormData({ name: '', modules: [] });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingRole(null);
        setFormData({ name: '', modules: [] });
    };

    const handleModuleToggle = (moduleName) => {
        setFormData(prev => {
            const modules = prev.modules.includes(moduleName)
                ? prev.modules.filter(m => m !== moduleName)
                : [...prev.modules, moduleName];
            return { ...prev, modules };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingRole) {
                await adminApi.updateRole(editingRole._id, formData);
                toast.success('Role updated');
            } else {
                await adminApi.createRole(formData);
                toast.success('Role created');
            }
            fetchRoles();
            handleCloseModal();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Action failed');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this role?')) {
            try {
                await adminApi.deleteRole(id);
                toast.success('Role deleted');
                fetchRoles();
            } catch (error) {
                toast.error('Failed to delete role');
            }
        }
    };

    if (loading) return <div className="p-6">Loading roles...</div>;

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Shield className="text-indigo-600" />
                        Role Management
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Manage admin roles and permissions</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
                >
                    <Plus size={18} />
                    Create Role
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm">
                            <th className="p-4 font-medium">Role Name</th>
                            <th className="p-4 font-medium">Accessible Modules</th>
                            <th className="p-4 font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {roles.map(role => (
                            <tr key={role._id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="p-4 font-medium text-slate-800">{role.name}</td>
                                <td className="p-4 text-sm text-slate-600">
                                    <div className="flex flex-wrap gap-1">
                                        {role.modules?.map(m => (
                                            <span key={m} className="px-2 py-1 bg-slate-100 rounded text-xs border border-slate-200">
                                                {m}
                                            </span>
                                        ))}
                                        {!role.modules?.length && <span className="text-slate-400">No modules assigned</span>}
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => handleOpenModal(role)} className="text-blue-600 hover:text-blue-800">
                                            <Edit2 size={16} />
                                        </button>
                                        <button onClick={() => handleDelete(role._id)} className="text-red-600 hover:text-red-800">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {roles.length === 0 && (
                            <tr>
                                <td colSpan="3" className="p-8 text-center text-slate-500">No roles found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-slate-100">
                            <h2 className="text-xl font-bold">{editingRole ? 'Edit Role' : 'Create Role'}</h2>
                        </div>
                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Role Name</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="e.g. Support Manager"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-3">Module Permissions</label>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {AVAILABLE_MODULES.map(module => (
                                        <label key={module} className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition">
                                            <input
                                                type="checkbox"
                                                checked={formData.modules.includes(module)}
                                                onChange={() => handleModuleToggle(module)}
                                                className="rounded text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-sm text-slate-700">{module}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                                >
                                    {editingRole ? 'Save Changes' : 'Create Role'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RolesManagement;
