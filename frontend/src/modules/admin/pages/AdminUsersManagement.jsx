import React, { useState, useEffect } from 'react';
import { adminApi } from '../services/adminApi';
import { Users, UserPlus, Shield, Mail, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

const AdminUsersManagement = () => {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Invite form state
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [setupToken, setSetupToken] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [roleId, setRoleId] = useState('');
    const [roleSearch, setRoleSearch] = useState('');
    const [showRoleSuggestions, setShowRoleSuggestions] = useState(false);
    const [inviting, setInviting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [usersRes, rolesRes] = await Promise.all([
                adminApi.getAdmins(),
                adminApi.getRoles()
            ]);
            
            if (usersRes.data?.success) {
                const usersPayload = usersRes.data.results || usersRes.data.result || usersRes.data.data || [];
                setUsers(Array.isArray(usersPayload) ? usersPayload : []);
            }
            if (rolesRes.data?.success) {
                const rolesPayload = rolesRes.data.results || rolesRes.data.result || rolesRes.data.data || [];
                setRoles(Array.isArray(rolesPayload) ? rolesPayload : []);
            }
        } catch (error) {
            toast.error('Failed to fetch data');
        } finally {
            setLoading(false);
        }
    };

    const handleToggleStatus = async (id) => {
        try {
            const res = await adminApi.toggleAdminStatus(id);
            if (res.data?.success) {
                toast.success(res.data.message || 'Status updated');
                fetchData();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update status');
        }
    };

    const resetForm = () => {
        setStep(1);
        setEmail('');
        setOtp('');
        setSetupToken('');
        setName('');
        setPassword('');
        setRoleId('');
        setRoleSearch('');
    };

    const handleSendOtp = async (e) => {
        e.preventDefault();
        setInviting(true);
        try {
            const res = await adminApi.invite({ email });
            if (res.data?.success) {
                toast.success('OTP sent to ' + email);
                setStep(2);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to send OTP');
        } finally {
            setInviting(false);
        }
    };

    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        setInviting(true);
        try {
            const res = await adminApi.verifyOtp({ email, otp });
            if (res.data?.success) {
                toast.success('OTP verified successfully');
                setSetupToken(res.data.result?.setupToken || res.data.data?.setupToken);
                setStep(3);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Invalid OTP');
        } finally {
            setInviting(false);
        }
    };

    const handleCreateAdmin = async (e) => {
        e.preventDefault();
        if (!name || !roleId || !password) {
            return toast.error('Please fill all required fields');
        }
        setInviting(true);
        try {
            const res = await adminApi.setupPassword({ setupToken, password, name, roleId });
            if (res.data?.success) {
                toast.success('Admin created successfully');
                setIsModalOpen(false);
                fetchData();
                resetForm();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create admin');
        } finally {
            setInviting(false);
        }
    };

    if (loading) return <div className="p-6">Loading admin users...</div>;

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Users className="text-indigo-600" />
                        Admin Users
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Manage platform administrators and their roles</p>
                </div>
                <button
                    onClick={() => {
                        resetForm();
                        setIsModalOpen(true);
                    }}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
                >
                    <UserPlus size={18} />
                    Create Admin
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm">
                            <th className="p-4 font-medium">Name</th>
                            <th className="p-4 font-medium">Email</th>
                            <th className="p-4 font-medium">Role</th>
                            <th className="p-4 font-medium">Status</th>
                            <th className="p-4 font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user._id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="p-4 font-medium text-slate-800">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                                            {user.name?.charAt(0).toUpperCase()}
                                        </div>
                                        {user.name}
                                    </div>
                                </td>
                                <td className="p-4 text-slate-600">{user.email}</td>
                                <td className="p-4">
                                    {user.isSuperAdmin ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                            <Shield size={12} />
                                            Super Admin
                                        </span>
                                    ) : (
                                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                            {roles.find(r => r._id === user.roleId)?.name || 'Unknown Role'}
                                        </span>
                                    )}
                                </td>
                                <td className="p-4">
                                    {user.isVerified ? (
                                        <span className={`inline-flex px-2 py-1 rounded text-xs ${user.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {user.isActive !== false ? 'Active' : 'Inactive'}
                                        </span>
                                    ) : (
                                        <span className="inline-flex px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">Pending Setup</span>
                                    )}
                                </td>
                                <td className="p-4">
                                    {!user.isSuperAdmin && user.isVerified && (
                                        <button
                                            onClick={() => handleToggleStatus(user._id)}
                                            className={`text-xs px-3 py-1.5 rounded-md transition font-medium border ${user.isActive !== false ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'}`}
                                        >
                                            {user.isActive !== false ? 'Deactivate' : 'Activate'}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <Shield className="text-indigo-600" />
                                {step === 1 ? 'Enter Email' : step === 2 ? 'Verify Email' : 'Setup Admin Details'}
                            </h2>
                        </div>
                        
                        {step === 1 && (
                            <form onSubmit={handleSendOtp} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                        placeholder="admin@zozi9.com"
                                    />
                                </div>
                                <div className="pt-4 flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={inviting}
                                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                                    >
                                        {inviting ? 'Sending OTP...' : 'Send OTP & Verify'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {step === 2 && (
                            <form onSubmit={handleVerifyOtp} className="space-y-4">
                                <div className="p-3 bg-indigo-50 text-indigo-700 rounded-lg text-sm mb-4">
                                    An OTP has been sent to <strong>{email}</strong>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Enter OTP</label>
                                    <input
                                        type="text"
                                        required
                                        value={otp}
                                        onChange={e => setOtp(e.target.value)}
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none tracking-widest text-center text-lg"
                                        placeholder="0000"
                                        maxLength={4}
                                    />
                                </div>
                                <div className="pt-4 flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setStep(1)}
                                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                                    >
                                        Back
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={inviting || otp.length < 4}
                                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                                    >
                                        {inviting ? 'Verifying...' : 'Verify OTP'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {step === 3 && (
                            <form onSubmit={handleCreateAdmin} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                        placeholder="John Doe"
                                    />
                                </div>
                                <div className="relative">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Assign Role</label>
                                    <input
                                        type="text"
                                        required
                                        value={roleSearch}
                                        onChange={e => {
                                            setRoleSearch(e.target.value);
                                            setRoleId('');
                                            setShowRoleSuggestions(true);
                                        }}
                                        onFocus={() => setShowRoleSuggestions(true)}
                                        onBlur={() => setTimeout(() => setShowRoleSuggestions(false), 200)}
                                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                        placeholder="Type to search role..."
                                    />
                                    {showRoleSuggestions && (
                                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                            {roles
                                                .filter(r => r.name.toLowerCase().includes(roleSearch.toLowerCase()))
                                                .map(r => (
                                                    <div
                                                        key={r._id}
                                                        className="px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm text-slate-700"
                                                        onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            setRoleSearch(r.name);
                                                            setRoleId(r._id);
                                                            setShowRoleSuggestions(false);
                                                        }}
                                                    >
                                                        {r.name}
                                                    </div>
                                                ))}
                                            {roles.filter(r => r.name.toLowerCase().includes(roleSearch.toLowerCase())).length === 0 && (
                                                <div className="px-4 py-2 text-sm text-slate-500">No matching roles</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Set Password</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            required
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none pr-10"
                                            placeholder="Create a strong password"
                                        />
                                        <button
                                            type="button"
                                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                                            onClick={() => setShowPassword(!showPassword)}
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>

                                <div className="pt-4 flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={inviting || roles.length === 0}
                                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                                    >
                                        {inviting ? 'Creating...' : 'Create Admin'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminUsersManagement;
