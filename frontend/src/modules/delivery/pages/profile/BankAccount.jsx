import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Landmark, CreditCard, AlertTriangle, CheckCircle2 } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import Input from "@/shared/components/ui/Input";
import { toast } from "sonner";
import { useAuth } from "@core/context/AuthContext";
import { deliveryApi } from "../../services/deliveryApi";

const BankAccount = () => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  
  const [bankDetails, setBankDetails] = useState({
    accountHolder: "Loading...",
    accountNumber: "XXXXXXXXXXXX",
    ifsc: "Loading...",
    bankName: "Bank Details",
    status: "Pending",
  });

  const [formData, setFormData] = useState({
    accountNumber: "",
    confirmAccountNumber: "",
    ifsc: "",
  });
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setBankDetails({
        accountHolder: user.accountHolder || user.name || "Not Provided",
        accountNumber: user.accountNumber ? `XXXX${user.accountNumber.slice(-4)}` : "Not Provided",
        ifsc: user.ifsc || "Not Provided",
        bankName: user.accountNumber ? "Bank Details" : "Pending",
        status: user.accountNumber ? "Verified" : "Pending",
      });
    }
  }, [user]);

  const handleUpdate = async () => {
    if (!formData.accountNumber || !formData.ifsc) {
      return toast.error("Please fill all fields");
    }
    if (formData.accountNumber !== formData.confirmAccountNumber) {
      return toast.error("Account numbers do not match");
    }

    setLoading(true);
    try {
      await deliveryApi.updateProfile({
        accountNumber: formData.accountNumber,
        ifsc: formData.ifsc
      });
      await refreshUser();
      setFormData({ accountNumber: "", confirmAccountNumber: "", ifsc: "" });
      toast.success("Bank details updated successfully!");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update bank details");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button 
            onClick={() => navigate(-1)} 
            className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-2"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="ds-h3 text-gray-900">Bank Account</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* Bank Card Visual */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white p-6 rounded-2xl shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          
          <div className="flex justify-between items-start mb-8 relative z-10">
            <Landmark size={32} className="text-white/80" />
            {bankDetails.status === "Verified" ? (
              <span className="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-emerald-500/30 flex items-center">
                <CheckCircle2 size={12} className="mr-1" /> Active
              </span>
            ) : (
              <span className="bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-yellow-500/30 flex items-center">
                <AlertTriangle size={12} className="mr-1" /> Pending
              </span>
            )}
          </div>

          <div className="space-y-1 relative z-10">
            <p className="text-gray-400 text-xs uppercase tracking-wider">Account Number</p>
            <p className="font-mono text-2xl tracking-widest">{bankDetails.accountNumber}</p>
          </div>

          <div className="flex justify-between items-end mt-8 relative z-10">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Account Holder</p>
              <p className="font-bold text-lg">{bankDetails.accountHolder}</p>
            </div>
            <div className="text-right">
              <p className="text-white font-bold">{bankDetails.bankName}</p>
              <p className="text-gray-400 text-xs">{bankDetails.ifsc}</p>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-xl flex items-start">
          <AlertTriangle size={20} className="text-yellow-600 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-yellow-800 font-bold text-sm mb-1">Payment Information</h4>
            <p className="text-xs text-yellow-700 leading-relaxed">
              Your weekly earnings will be deposited to this account every Tuesday. 
              Changes to bank details may delay your next payout by up to 7 days.
            </p>
          </div>
        </div>

        {/* Change Request Form */}
        <div className="pt-4">
          <h3 className="ds-h4 text-gray-900 mb-4">Request Change</h3>
          <div className="space-y-4">
            <Input 
              label="New Account Number" 
              placeholder="Enter account number" 
              icon={CreditCard}
              value={formData.accountNumber}
              onChange={(e) => setFormData({...formData, accountNumber: e.target.value})}
            />
            <Input 
              label="Confirm Account Number" 
              placeholder="Re-enter account number" 
              icon={CreditCard}
              value={formData.confirmAccountNumber}
              onChange={(e) => setFormData({...formData, confirmAccountNumber: e.target.value})}
            />
            <Input 
              label="IFSC Code" 
              placeholder="Enter IFSC code" 
              icon={Landmark}
              value={formData.ifsc}
              onChange={(e) => setFormData({...formData, ifsc: e.target.value})}
            />
            <Button 
              className="w-full mt-2" 
              variant="outline"
              onClick={handleUpdate}
              disabled={loading}
            >
              {loading ? "Updating..." : "Verify & Update"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BankAccount;
