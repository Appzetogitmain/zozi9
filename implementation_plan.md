# Free Delivery - Minimum Amount Plan

## Goal
To allow admins to set a minimum order amount for a "Free Delivery" coupon (e.g., "Get free delivery on orders above ₹500").

## Proposed Changes

### Frontend (`frontend/src/modules/admin/pages/CouponManagement.jsx`)
- Update the dynamic form rendering logic.
- Currently, the **Min Order Requirement** field is only shown when the Coupon Strategy is `"Minimum Order Value Coupon"`.
- We will modify the condition so that this field is shown when the Coupon Strategy is `"Minimum Order Value Coupon"` **OR** `"Free Delivery Coupon"`.

### Backend (`backend/app/controller/couponController.js`)
- **No changes required!**
- The backend already has a universal check: if `minOrderValue` is set on *any* coupon, it ensures the `cartTotal` is $\geq$ `minOrderValue` before allowing the coupon to be applied.

## User Review Required
> [!NOTE]
> Since the backend already natively supports checking the minimum order value for all coupons, we only need to expose the input field for Free Delivery in the admin panel. 
> 
> Does this approach look good to you? If yes, I will implement it immediately.
