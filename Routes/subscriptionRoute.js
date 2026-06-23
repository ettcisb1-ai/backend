const express = require('express');
const router = express.Router();
const {
    // Admin
    getSubscriptionSettings,
    updateSubscriptionSettings,
    createPlan,
    updatePlan,
    deletePlan,
    createCoupon,
    deleteCoupon,
    getPayments,
    refundPayment,
    adminUpdateUserSubscription,
    // User
    getPublicSubscriptionInfo,
    validateCoupon,
    purchaseSubscription,
    getMySubscription,
} = require('../Controllers/subscriptionController');
const { protect, authorize } = require('../Middlewares/auth');

// ─── Public (no auth needed) ──────────────────────────────────────────────────
// FR-35 / FR-36: Users can check portal mode and available plans without login
router.get('/public', getPublicSubscriptionInfo);

// FR-40: Validate coupon (public so guest checkout works if needed)
router.post('/coupons/validate', protect, validateCoupon);

// ─── User (authenticated) ─────────────────────────────────────────────────────
// FR-37: Purchase a subscription
router.post('/purchase', protect, purchaseSubscription);

// FR-41 / FR-42: Get own subscription status + payment history
router.get('/me', protect, getMySubscription);

// ─── Admin only ───────────────────────────────────────────────────────────────
// FR-38: Get full subscription settings
router.get('/settings', protect, authorize('admin'), getSubscriptionSettings);

// FR-38 / FR-39: Update portal mode, currencies, trial settings
router.put('/settings', protect, authorize('admin'), updateSubscriptionSettings);

// FR-40: Plan CRUD
router.post('/plans', protect, authorize('admin'), createPlan);           // Create new plan
router.put('/plans/:planId', protect, authorize('admin'), updatePlan);    // Edit plan
router.delete('/plans/:planId', protect, authorize('admin'), deletePlan); // Delete plan

// Coupon management
router.post('/coupons', protect, authorize('admin'), createCoupon);
router.delete('/coupons/:code', protect, authorize('admin'), deleteCoupon);

// Payment records
router.get('/payments', protect, authorize('admin'), getPayments);
router.patch('/payments/:txnId/refund', protect, authorize('admin'), refundPayment);

// FR-38: Admin manually update a user's subscription
router.put('/users/:userId', protect, authorize('admin'), adminUpdateUserSubscription);

module.exports = router;