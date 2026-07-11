import React, { useState, useEffect } from "react";
import { 
  AlertOctagon, 
  Search,
  RefreshCw,
  XCircle,
  Truck,
  MapPin,
  Clock,
  ChevronRight,
  ShieldAlert
} from "lucide-react";
import { adminApi } from "../services/adminApi";
import { format } from "date-fns";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { useNavigate } from "react-router-dom";

const EscalationDashboard = () => {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(null);
  const navigate = useNavigate();

  const fetchEscalatedOrders = async () => {
    setIsLoading(true);
    try {
      const res = await adminApi.getOrders({ status: "escalated", limit: 50 });
      if (res.data?.success) {
        setOrders(res.data.result?.orders || []);
      }
    } catch (error) {
      toast.error("Failed to fetch escalated orders");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEscalatedOrders();
  }, []);

  const handleRebroadcast = async (orderId) => {
    setIsProcessing(orderId);
    try {
      // Re-trigger the delivery broadcast process (using the same seller endpoint logic)
      const res = await adminApi.processToDelivery(orderId);
      if (res.data?.success) {
        toast.success("Order re-broadcasted successfully!");
        setOrders(orders.filter((o) => o.orderId !== orderId));
      }
    } catch (error) {
      toast.error("Failed to re-broadcast order");
    } finally {
      setIsProcessing(null);
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm("Are you sure you want to cancel this order?")) return;
    setIsProcessing(orderId);
    try {
      // Using existing status update endpoint
      const res = await adminApi.updateOrderStatus(orderId, { status: "cancelled", cancelReason: "Admin cancelled due to driver unavailability" });
      if (res.data?.success) {
        toast.success("Order cancelled");
        setOrders(orders.filter((o) => o.orderId !== orderId));
      }
    } catch (error) {
      toast.error("Failed to cancel order");
    } finally {
      setIsProcessing(null);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3 tracking-tight">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
              <ShieldAlert className="h-6 w-6" strokeWidth={2.5} />
            </div>
            Escalation Dashboard
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-2">
            Orders requiring immediate attention due to driver unavailability
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={fetchEscalatedOrders} 
          disabled={isLoading}
          className="bg-white"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center bg-white p-16 rounded-3xl border border-dashed border-slate-200">
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertOctagon className="h-10 w-10 text-emerald-700" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">All clear!</h2>
          <p className="text-sm text-slate-500">No escalated orders require attention right now.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          <AnimatePresence>
            {orders.map((order) => (
              <motion.div
                key={order.orderId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <Card className="p-5 border-l-4 border-l-rose-500 shadow-sm hover:shadow-md transition-all">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black px-2 py-1 bg-rose-100 text-rose-700 rounded-md uppercase tracking-widest">
                          Escalated
                        </span>
                        <h3 className="font-bold text-slate-900 cursor-pointer hover:text-primary transition-colors" onClick={() => navigate(`/admin/orders/${order.orderId}`)}>
                          #{order.orderId}
                        </h3>
                        <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {format(new Date(order.createdAt), "hh:mm a")}
                        </span>
                      </div>
                      
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="flex items-start gap-2 text-sm text-slate-600">
                          <MapPin className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-semibold text-slate-800 text-xs font-bold uppercase tracking-wider mb-0.5">Seller</p>
                            <p className="line-clamp-1">{order.seller?.shopName || "Unknown Seller"}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 text-sm text-slate-600">
                          <MapPin className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-semibold text-slate-800 text-xs font-bold uppercase tracking-wider mb-0.5">Customer</p>
                            <p className="line-clamp-1">{order.address?.address || "Unknown Address"}</p>
                          </div>
                        </div>
                      </div>
                      
                      <p className="text-xs font-semibold text-rose-600 bg-rose-50 inline-block px-3 py-1.5 rounded-lg">
                        Reason: {order.escalationReason || "No delivery partner found"}
                      </p>
                    </div>

                    <div className="flex flex-row md:flex-col gap-2 shrink-0">
                      <Button 
                        variant="primary"
                        onClick={() => handleRebroadcast(order.orderId)}
                        disabled={isProcessing === order.orderId}
                        className="flex-1 md:w-full bg-brand-600 hover:bg-brand-700 font-bold"
                      >
                        {isProcessing === order.orderId ? (
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Truck className="w-4 h-4 mr-2" />
                        )}
                        Re-broadcast
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => handleCancelOrder(order.orderId)}
                        disabled={isProcessing === order.orderId}
                        className="flex-1 md:w-full border-rose-200 text-rose-600 hover:bg-rose-50 font-bold"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Cancel Order
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default EscalationDashboard;
