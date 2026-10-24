import axiosInstance from '@core/api/axios';

export const adminApi = {
    login: (data) => axiosInstance.post('/admin/login', data),
    signup: (data) => axiosInstance.post('/admin/signup', data),
    invite: (data) => axiosInstance.post('/admin/invite', data),
    verifyOtp: (data) => axiosInstance.post('/admin/verify-otp', data),
    setupPassword: (data) => axiosInstance.post('/admin/setup-password', data),
    toggleAdminStatus: (id) => axiosInstance.put(`/admin/users/${id}/toggle-status`),
    
    // Roles
    getRoles: () => axiosInstance.get('/admin/roles'),
    getRoleById: (id) => axiosInstance.get(`/admin/roles/${id}`),
    createRole: (data) => axiosInstance.post('/admin/roles', data),
    updateRole: (id, data) => axiosInstance.put(`/admin/roles/${id}`, data),
    deleteRole: (id) => axiosInstance.delete(`/admin/roles/${id}`),

    getAdmins: () => axiosInstance.get('/admin/admins'),
    getStats: () => axiosInstance.get('/admin/stats'),
    getUsers: (params) => axiosInstance.get('/admin/users', { params }),
    getUserById: (id) => axiosInstance.get(`/admin/users/${id}`),
    getActiveSellers: (params) => axiosInstance.get('/admin/sellers/active', { params }),
    getSellerShopTiming: (id) => axiosInstance.get(`/admin/sellers/${id}/shop-timing`),
    updateSellerShopHours: (id, data) => axiosInstance.put(`/admin/sellers/${id}/shop-timing`, data),
    setSellerShopStatus: (id, data) => axiosInstance.patch(`/admin/sellers/${id}/shop-timing/status`, data),
    getSellerLocations: (params) => axiosInstance.get('/admin/sellers/locations', { params }),
    getPendingSellers: (params) => axiosInstance.get('/admin/sellers/pending', { params }),
    approveSeller: (id) => axiosInstance.patch(`/admin/sellers/approve/${id}`),
    rejectSeller: (id, data) => axiosInstance.delete(`/admin/sellers/reject/${id}`, { data }),
    getAdminWalletData: (params) => axiosInstance.get('/admin/wallet-data', { params }),
    getReports: () => axiosInstance.get('/admin/reports'),
    getProfile: () => axiosInstance.get('/admin/profile'),
    updateProfile: (data) => axiosInstance.put('/admin/profile', data),
    updatePassword: (data) => axiosInstance.put('/admin/profile/password', data),
    getPlatformSettings: () => axiosInstance.get('/admin/settings/platform'),
    updatePlatformSettings: (data) => axiosInstance.put('/admin/settings/platform', data),
    
    // Maintenance
    getMaintenanceSettings: () => axiosInstance.get('/admin/settings/maintenance'),
    updateMaintenanceSettings: (data) => axiosInstance.put('/admin/settings/maintenance', data),

    getDeliveryFinanceSettings: () => axiosInstance.get('/admin/settings/delivery'),
    updateDeliveryFinanceSettings: (data) => axiosInstance.put('/admin/settings/delivery', data),
    getFinanceSummary: () => axiosInstance.get('/admin/finance/summary'),
    getFinanceLedger: (params) => axiosInstance.get('/admin/finance/ledger', { params }),
    getFinancePayouts: (params) => axiosInstance.get('/admin/finance/payouts', { params }),
    processFinancePayouts: (data) => axiosInstance.post('/admin/finance/payouts/process', data),
    exportFinanceStatement: (params) =>
        axiosInstance.get('/admin/finance/export-statement', { params, responseType: 'blob' }),
    // Centralized settings (public GET, admin PUT)
    getSettings: () => axiosInstance.get('/settings'),
    updateSettings: (data) => axiosInstance.put('/settings', data),
    uploadSettingsImage: (formData, type = 'logo') =>
        axiosInstance.post(`/settings/upload?type=${type}`, formData),

    // Category Management
    getCategories: (params) => axiosInstance.get('/admin/categories', { params }),
    getCategoryTree: () => axiosInstance.get('/admin/categories?tree=true'),
    getSellers: (params) => axiosInstance.get('/admin/sellers', { params }),
    createCategory: (formData) => axiosInstance.post('/admin/categories', formData),
    updateCategory: (id, formData) => axiosInstance.put(`/admin/categories/${id}`, formData),
    deleteCategory: (id) => axiosInstance.delete(`/admin/categories/${id}`),
    getParentUnits: () => axiosInstance.get('/admin/categories?flat=true'),

    // Product Management
    getProducts: (params) => axiosInstance.get('/products', { params }),

    // Spin & Win
    getSpinSettings: () => axiosInstance.get('/admin/spin/settings'),
    updateSpinSettings: (data) => axiosInstance.patch('/admin/spin/settings', data),
    getSpinCampaigns: (params) => axiosInstance.get('/admin/spin/campaigns', { params }),
    getSpinCampaign: (id) => axiosInstance.get(`/admin/spin/campaigns/${id}`),
    createSpinCampaign: (data) => axiosInstance.post('/admin/spin/campaigns', data),
    updateSpinCampaign: (id, data) => axiosInstance.patch(`/admin/spin/campaigns/${id}`, data),
    setSpinCampaignStatus: (id, status) => axiosInstance.patch(`/admin/spin/campaigns/${id}/status`, { status }),
    addSpinReward: (campaignId, data) => axiosInstance.post(`/admin/spin/campaigns/${campaignId}/rewards`, data),
    updateSpinReward: (id, data) => axiosInstance.patch(`/admin/spin/rewards/${id}`, data),
    deleteSpinReward: (id) => axiosInstance.delete(`/admin/spin/rewards/${id}`),
    reorderSpinRewards: (campaignId, ids) => axiosInstance.put(`/admin/spin/campaigns/${campaignId}/rewards/order`, { ids }),
    getSpinReport: (params) => axiosInstance.get('/admin/spin/reports', { params }),
    // Refer & Earn
    getReferralSettings: () => axiosInstance.get('/admin/referrals/settings'),
    updateReferralSettings: (data) => axiosInstance.patch('/admin/referrals/settings', data),
    getReferrals: (params) => axiosInstance.get('/admin/referrals', { params }),
    getProductModerationList: (params) => axiosInstance.get('/products/moderation', { params }),
    approveProductModeration: (id, data = {}) => axiosInstance.patch(`/products/moderation/${id}/approve`, data),
    rejectProductModeration: (id, data = {}) => axiosInstance.patch(`/products/moderation/${id}/reject`, data),
    createProduct: (formData) => axiosInstance.post('/products', formData),
    updateProduct: (id, formData) => axiosInstance.put(`/products/${id}`, formData),
    deleteProduct: (id) => axiosInstance.delete(`/products/${id}`),
    getOrders: (params) => axiosInstance.get('/orders/seller-orders', { params }),
    getOrderDetails: (orderId) => axiosInstance.get(`/orders/details/${orderId}`),
    updateOrderStatus: (orderId, data) => axiosInstance.put(`/orders/status/${orderId}`, data),
    // Returns
    getReturns: (params) => axiosInstance.get('/orders/seller-returns', { params }),
    getReturnDetails: (orderId) => axiosInstance.get(`/orders/${orderId}/returns`),
    approveReturn: (orderId, data) => axiosInstance.put(`/orders/returns/${orderId}/approve`, data),
    rejectReturn: (orderId, data) => axiosInstance.put(`/orders/returns/${orderId}/reject`, data),
    assignReturnDelivery: (orderId, data) => axiosInstance.put(`/orders/returns/${orderId}/assign-delivery`, data),
    updateReturnQc: (orderId, data) => axiosInstance.put(`/orders/returns/${orderId}/qc`, data),

    // Support Tickets
    getTickets: (params) => axiosInstance.get('/tickets/admin/all', { params }),
    updateTicketStatus: (id, status) => axiosInstance.patch(`/tickets/admin/status/${id}`, { status }),
    replyTicket: (id, text, options = {}) => {
        const { mediaUrl = "", mediaType = "", mimeType = "" } = options || {};
        return axiosInstance.post(`/tickets/reply/${id}`, { text, isAdmin: true, mediaUrl, mediaType, mimeType });
    },
    getNotifications: () => axiosInstance.get('/notifications'),
    markNotificationRead: (id) => axiosInstance.put(`/notifications/${id}/read`),
    markAllNotificationsRead: () => axiosInstance.put('/notifications/mark-all-read'),
    broadcastNotification: (data) => axiosInstance.post('/notifications/broadcast', data),
    getBroadcastAudienceStats: () => axiosInstance.get('/notifications/broadcast/audience-stats'),

    // Reviews
    getPendingReviews: (params) => axiosInstance.get('/reviews/admin/pending', { params }),
    updateReviewStatus: (id, status) => axiosInstance.patch(`/reviews/admin/status/${id}`, { status }),

    // Delivery Partners
    getDeliveryPartners: (params) => axiosInstance.get('/admin/delivery-partners', { params }),
    approveDeliveryPartner: (id) => axiosInstance.patch(`/admin/delivery-partners/approve/${id}`),
    rejectDeliveryPartner: (id) => axiosInstance.delete(`/admin/delivery-partners/reject/${id}`),
    getActiveFleet: (params) => axiosInstance.get('/admin/active-fleet', { params }),

    // Delivery Payouts / Funds
    getDeliveryTransactions: (params) => axiosInstance.get('/admin/delivery-transactions', { params }),
    settleTransaction: (id) => axiosInstance.put(`/admin/transactions/${id}/settle`),
    bulkSettleDelivery: () => axiosInstance.put('/admin/transactions/bulk-settle-delivery'),

    // Seller Withdrawals
    getSellerWithdrawals: (params) => axiosInstance.get('/admin/seller-withdrawals', { params }),
    getDeliveryWithdrawals: (params) => axiosInstance.get('/admin/delivery-withdrawals', { params }),
    getSellerTransactions: (params) => axiosInstance.get('/admin/seller-transactions', { params }),
    updateWithdrawalStatus: (id, data) => axiosInstance.put(`/admin/withdrawals/${id}`, data),
    // Cash Collection Hub
    getDeliveryCashBalances: (params) => axiosInstance.get('/admin/delivery-cash', { params }),
    getRiderCashDetails: (id) => axiosInstance.get(`/admin/rider-cash-details/${id}`),
    settleRiderCash: (data) => axiosInstance.post('/admin/settle-cash', data),
    getCashSettlementHistory: (params) => axiosInstance.get('/admin/cash-history', { params }),

    // Login History
    getLoginHistory: (params) => axiosInstance.get('/admin/login-history', { params }),

    // Reports
    getProductSalesReport: (params) => axiosInstance.get('/admin/reports/product-sales', { params }),

    // FAQ Management
    getFAQs: (params) => axiosInstance.get('/admin/faqs', { params }),
    createFAQ: (data) => axiosInstance.post('/admin/faqs', data),
    updateFAQ: (id, data) => axiosInstance.put(`/admin/faqs/${id}`, data),
    deleteFAQ: (id) => axiosInstance.delete(`/admin/faqs/${id}`),
    // Public FAQs (for profile pages, etc.)
    getPublicFAQs: (params) => axiosInstance.get('/public/faqs', { params }),

    // Experience Studio / Content Manager
    getExperienceSections: (params) => axiosInstance.get('/admin/experience', { params }),
    createExperienceSection: (data) => axiosInstance.post('/admin/experience', data),
    updateExperienceSection: (id, data) => axiosInstance.put(`/admin/experience/${id}`, data),
    deleteExperienceSection: (id) => axiosInstance.delete(`/admin/experience/${id}`),
    reorderExperienceSections: (items) => axiosInstance.put('/admin/experience/reorder', { items }),
    uploadExperienceBanner: (formData) => axiosInstance.post('/admin/experience/upload-banner', formData),

    // Hero config (separate hero banners + categories per page)
    getHeroConfig: (params) => axiosInstance.get('/admin/experience/hero', { params }),
    setHeroConfig: (data) => axiosInstance.put('/admin/experience/hero', data),

    // Offers Management
    getOffers: (params) => axiosInstance.get('/admin-offers', { params }),
    createOffer: (data) => axiosInstance.post('/admin-offers', data),
    updateOffer: (id, data) => axiosInstance.put(`/admin-offers/${id}`, data),
    deleteOffer: (id) => axiosInstance.delete(`/admin-offers/${id}`),
    reorderOffers: (items) => axiosInstance.put('/admin-offers/reorder', { items }),

    // Product expiry (all sellers)
    getExpiryProducts: (params) => axiosInstance.get('/products/expiry', { params }),
    updateProductExpiry: (id, data) => axiosInstance.patch(`/products/${id}/expiry`, data),

    // Flash Sales
    getFlashSales: (params) => axiosInstance.get('/flash-sales/admin', { params }),
    createFlashSale: (data) => axiosInstance.post('/flash-sales/admin', data),
    updateFlashSale: (id, data) => axiosInstance.put(`/flash-sales/admin/${id}`, data),
    reviewFlashSale: (id, action, reason) => axiosInstance.patch(`/flash-sales/admin/${id}/review`, { action, reason }),
    setFlashSaleActive: (id, isActive) => axiosInstance.patch(`/flash-sales/admin/${id}/active`, { isActive }),
    endFlashSale: (id) => axiosInstance.patch(`/flash-sales/admin/${id}/end`),
    deleteFlashSale: (id) => axiosInstance.delete(`/flash-sales/admin/${id}`),

    // Offer Sections (category → products, banner + side image)
    getOfferSections: (params) => axiosInstance.get('/admin-offer-sections', { params }),
    createOfferSection: (data) => axiosInstance.post('/admin-offer-sections', data),
    updateOfferSection: (id, data) => axiosInstance.put(`/admin-offer-sections/${id}`, data),
    deleteOfferSection: (id) => axiosInstance.delete(`/admin-offer-sections/${id}`),
    reorderOfferSections: (items) => axiosInstance.put('/admin-offer-sections/reorder', { items }),

    // Coupons & Promos
    getCoupons: (params) => axiosInstance.get('/admin/coupons', { params }),
    createCoupon: (data) => axiosInstance.post('/admin/coupons', data),
    updateCoupon: (id, data) => axiosInstance.put(`/admin/coupons/${id}`, data),
    deleteCoupon: (id) => axiosInstance.delete(`/admin/coupons/${id}`),

    // Legal Pages
    getLegalPage: (role, type) => axiosInstance.get(`/legal/${role}/${type}`),
    updateLegalPage: (role, type, data) => axiosInstance.put(`/legal/${role}/${type}`, data),

    // Delivery Slots
    getDeliverySlots: (params) => axiosInstance.get('/delivery-slots', { params }),
    createDeliverySlot: (data) => axiosInstance.post('/delivery-slots', data),
    updateDeliverySlot: (id, data) => axiosInstance.put(`/delivery-slots/${id}`, data),
    deleteDeliverySlot: (id) => axiosInstance.delete(`/delivery-slots/${id}`),
};
