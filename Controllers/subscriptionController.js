const SubscriptionSettings = require('../Models/Subscription');
const User = require('../Models/User');

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const generateTxnId = () => {
    const rand = Math.floor(Math.random() * 90000 + 10000);
    return `TXN-${rand}`;
};

const calcExpiryDate = (planId) => {
    const now = new Date();
    if (planId === 'lifetime') return null;
    if (planId === 'yearly') {
        now.setFullYear(now.getFullYear() + 1);
        return now;
    }
    now.setMonth(now.getMonth() + 1);
    return now;
};

// Generate a URL-safe planId slug from a name
const slugify = (name) =>
    name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN: GET subscription settings
//  GET /api/subscriptions/settings
// ─────────────────────────────────────────────────────────────────────────────
const getSubscriptionSettings = async (req, res) => {
    try {
        const settings = await SubscriptionSettings.getSingleton();
        return res.status(200).json({ success: true, data: settings });
    } catch (error) {
        console.error('getSubscriptionSettings error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN: Update general settings (FR-35, FR-38, FR-39, FR-40)
//  PUT /api/subscriptions/settings
// ─────────────────────────────────────────────────────────────────────────────
const updateSubscriptionSettings = async (req, res) => {
    try {
        const settings = await SubscriptionSettings.getSingleton();

        const {
            subscriptionModeEnabled,
            portalMode,
            hasTrial,
            trialDays,
            enabledCurrencies,
        } = req.body;

        if (subscriptionModeEnabled !== undefined)
            settings.subscriptionModeEnabled = subscriptionModeEnabled;
        if (portalMode !== undefined) {
            if (!['free', 'paid'].includes(portalMode)) {
                return res.status(400).json({ success: false, message: 'portalMode must be "free" or "paid"' });
            }
            settings.portalMode = portalMode;
        }

        if (hasTrial !== undefined) settings.hasTrial = hasTrial;
        if (trialDays !== undefined) settings.trialDays = Math.max(1, Number(trialDays));

        if (enabledCurrencies && typeof enabledCurrencies === 'object') {
            const enabled = Object.entries(enabledCurrencies).filter(([, v]) => v === true);
            if (enabled.length === 0) {
                return res.status(400).json({ success: false, message: 'At least one currency must remain enabled' });
            }
            Object.keys(settings.enabledCurrencies.toObject?.() ?? settings.enabledCurrencies).forEach((key) => {
                if (enabledCurrencies[key] !== undefined) {
                    settings.enabledCurrencies[key] = enabledCurrencies[key];
                }
            });
        }

        const updated = await settings.save();
        return res.status(200).json({
            success: true,
            message: 'Subscription settings updated',
            data: updated,
        });
    } catch (error) {
        console.error('updateSubscriptionSettings error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN: Create a new plan
//  POST /api/subscriptions/plans
// ─────────────────────────────────────────────────────────────────────────────
const createPlan = async (req, res) => {
    try {
        const { name, description, pricing, isEnabled } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Plan name is required' });
        }

        const settings = await SubscriptionSettings.getSingleton();

        // Generate a unique planId from the name
        let planId = slugify(name);
        if (!planId) planId = `plan_${Date.now()}`;

        // Ensure uniqueness
        const exists = settings.plans.find((p) => p.planId === planId);
        if (exists) {
            planId = `${planId}_${Date.now()}`;
        }

        const newPlan = {
            planId,
            name: name.trim(),
            description: description?.trim() || '',
            isEnabled: isEnabled !== undefined ? Boolean(isEnabled) : true,
            pricing: {
                PKR: Number(pricing?.PKR) || 0,
                USD: Number(pricing?.USD) || 0,
                EUR: Number(pricing?.EUR) || 0,
            },
        };

        settings.plans.push(newPlan);
        await settings.save();

        return res.status(201).json({
            success: true,
            message: `Plan "${name}" created successfully`,
            data: newPlan,
        });
    } catch (error) {
        console.error('createPlan error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN: Update a plan's pricing / enabled state (FR-40)
//  PUT /api/subscriptions/plans/:planId
// ─────────────────────────────────────────────────────────────────────────────
const updatePlan = async (req, res) => {
    try {
        const { planId } = req.params;
        const settings = await SubscriptionSettings.getSingleton();

        const planIndex = settings.plans.findIndex((p) => p.planId === planId);
        if (planIndex === -1) {
            return res.status(404).json({ success: false, message: `Plan "${planId}" not found` });
        }

        const plan = settings.plans[planIndex];

        if (req.body.name !== undefined) plan.name = req.body.name;
        if (req.body.description !== undefined) plan.description = req.body.description;
        if (req.body.isEnabled !== undefined) plan.isEnabled = req.body.isEnabled;

        if (req.body.pricing && typeof req.body.pricing === 'object') {
            ['PKR', 'USD', 'EUR'].forEach((curr) => {
                if (req.body.pricing[curr] !== undefined) {
                    plan.pricing[curr] = Number(req.body.pricing[curr]);
                }
            });
        }

        const updated = await settings.save();
        return res.status(200).json({
            success: true,
            message: `Plan "${planId}" updated`,
            data: updated.plans[planIndex],
        });
    } catch (error) {
        console.error('updatePlan error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN: Delete a plan
//  DELETE /api/subscriptions/plans/:planId
// ─────────────────────────────────────────────────────────────────────────────
const deletePlan = async (req, res) => {
    try {
        const { planId } = req.params;
        const settings = await SubscriptionSettings.getSingleton();

        const before = settings.plans.length;
        settings.plans = settings.plans.filter((p) => p.planId !== planId);

        if (settings.plans.length === before) {
            return res.status(404).json({ success: false, message: `Plan "${planId}" not found` });
        }

        await settings.save();
        return res.status(200).json({ success: true, message: `Plan "${planId}" deleted successfully` });
    } catch (error) {
        console.error('deletePlan error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN: Create coupon
//  POST /api/subscriptions/coupons
// ─────────────────────────────────────────────────────────────────────────────
const createCoupon = async (req, res) => {
    try {
        const { code, discount, expiry } = req.body;

        if (!code || !discount || !expiry) {
            return res.status(400).json({ success: false, message: 'code, discount and expiry are required' });
        }

        const settings = await SubscriptionSettings.getSingleton();

        const upperCode = String(code).toUpperCase().trim();
        const exists = settings.coupons.find((c) => c.code === upperCode);
        if (exists) {
            return res.status(400).json({ success: false, message: 'Coupon code already exists' });
        }

        const expDate = new Date(expiry);
        const status = expDate >= new Date() ? 'Active' : 'Expired';

        settings.coupons.unshift({
            code: upperCode,
            discount: Number(discount),
            expiry: expDate,
            status,
        });

        const updated = await settings.save();
        return res.status(201).json({
            success: true,
            message: 'Coupon created',
            data: updated.coupons[0],
        });
    } catch (error) {
        console.error('createCoupon error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN: Delete coupon
//  DELETE /api/subscriptions/coupons/:code
// ─────────────────────────────────────────────────────────────────────────────
const deleteCoupon = async (req, res) => {
    try {
        const { code } = req.params;
        const settings = await SubscriptionSettings.getSingleton();

        const before = settings.coupons.length;
        settings.coupons = settings.coupons.filter(
            (c) => c.code !== String(code).toUpperCase()
        );

        if (settings.coupons.length === before) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }

        await settings.save();
        return res.status(200).json({ success: true, message: 'Coupon deleted' });
    } catch (error) {
        console.error('deleteCoupon error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN: Get all payments / transactions
//  GET /api/subscriptions/payments
// ─────────────────────────────────────────────────────────────────────────────
const getPayments = async (req, res) => {
    try {
        const settings = await SubscriptionSettings.getSingleton();
        const sorted = [...settings.payments].sort(
            (a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate)
        );
        return res.status(200).json({ success: true, count: sorted.length, data: sorted });
    } catch (error) {
        console.error('getPayments error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN: Refund a payment
//  PATCH /api/subscriptions/payments/:txnId/refund
// ─────────────────────────────────────────────────────────────────────────────
const refundPayment = async (req, res) => {
    try {
        const { txnId } = req.params;
        const settings = await SubscriptionSettings.getSingleton();

        const payment = settings.payments.find((p) => p.txnId === txnId);
        if (!payment) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        if (payment.status !== 'Success') {
            return res.status(400).json({
                success: false,
                message: `Cannot refund a transaction with status "${payment.status}"`,
            });
        }

        payment.status = 'Refunded';

        const user = await User.findById(payment.user);
        if (user && user.subscribed && user.planType !== 'Free') {
            user.subscribed = false;
            user.planType = 'Free';
            await user.save();
        }

        await settings.save();
        return res.status(200).json({
            success: true,
            message: `Transaction ${txnId} refunded`,
            data: payment,
        });
    } catch (error) {
        console.error('refundPayment error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN: Update user subscription manually
//  PUT /api/subscriptions/users/:userId
// ─────────────────────────────────────────────────────────────────────────────
const adminUpdateUserSubscription = async (req, res) => {
    try {
        const { userId } = req.params;
        const { subscribed, planType, currency, purchaseDate, expiryDate } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (subscribed !== undefined) user.subscribed = subscribed;
        if (planType) user.planType = planType;
        if (currency) user.currency = currency;
        if (purchaseDate) user.purchaseDate = purchaseDate;
        if (expiryDate) user.expiryDate = expiryDate;

        const updated = await user.save();
        return res.status(200).json({
            success: true,
            message: 'User subscription updated',
            data: {
                _id: updated._id,
                name: updated.name,
                email: updated.email,
                subscribed: updated.subscribed,
                planType: updated.planType,
                currency: updated.currency,
                purchaseDate: updated.purchaseDate,
                expiryDate: updated.expiryDate,
            },
        });
    } catch (error) {
        console.error('adminUpdateUserSubscription error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  USER: Get public subscription info (plans + portal mode)
//  GET /api/subscriptions/public
// ─────────────────────────────────────────────────────────────────────────────
const getPublicSubscriptionInfo = async (req, res) => {
    try {
        const settings = await SubscriptionSettings.getSingleton();
        return res.status(200).json({
            success: true,
            data: {
                portalMode: settings.portalMode,
                subscriptionModeEnabled: settings.subscriptionModeEnabled,
                hasTrial: settings.hasTrial,
                trialDays: settings.trialDays,
                enabledCurrencies: settings.enabledCurrencies,
                plans: settings.plans.filter((p) => p.isEnabled),
                coupons: settings.coupons
                    .filter((c) => c.status === 'Active' && new Date(c.expiry) >= new Date())
                    .map((c) => ({ code: c.code, discount: c.discount, status: c.status })),
            },
        });
    } catch (error) {
        console.error('getPublicSubscriptionInfo error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  USER: Validate a coupon code
//  POST /api/subscriptions/coupons/validate
// ─────────────────────────────────────────────────────────────────────────────
const validateCoupon = async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ success: false, message: 'Coupon code is required' });
        }

        const settings = await SubscriptionSettings.getSingleton();
        const upperCode = String(code).toUpperCase().trim();
        const coupon = settings.coupons.find(
            (c) =>
                c.code === upperCode &&
                c.status === 'Active' &&
                new Date(c.expiry) >= new Date()
        );

        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Invalid or expired coupon code' });
        }

        return res.status(200).json({
            success: true,
            data: {
                code: coupon.code,
                discount: coupon.discount,
                expiry: coupon.expiry,
            },
        });
    } catch (error) {
        console.error('validateCoupon error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  USER: Purchase subscription (FR-37, FR-41)
//  POST /api/subscriptions/purchase
// ─────────────────────────────────────────────────────────────────────────────
const purchaseSubscription = async (req, res) => {
    try {
        const { planId, currency, couponCode, cardName, cardLast4 } = req.body;

        if (!planId || !currency) {
            return res.status(400).json({ success: false, message: 'planId and currency are required' });
        }

        const settings = await SubscriptionSettings.getSingleton();

        if (!settings.subscriptionModeEnabled) {
            return res.status(400).json({
                success: false,
                message: 'Subscription checkout is currently disabled by the administrator',
            });
        }

        const plan = settings.plans.find((p) => p.planId === planId && p.isEnabled);
        if (!plan) {
            return res.status(404).json({ success: false, message: 'Selected plan not found or disabled' });
        }

        if (!settings.enabledCurrencies[currency]) {
            return res.status(400).json({ success: false, message: `Currency "${currency}" is not enabled` });
        }

        const rawPrice = plan.pricing[currency] ?? 0;
        let discountAmount = 0;
        let appliedCouponCode = '';

        if (couponCode) {
            const upperCode = String(couponCode).toUpperCase().trim();
            const coupon = settings.coupons.find(
                (c) =>
                    c.code === upperCode &&
                    c.status === 'Active' &&
                    new Date(c.expiry) >= new Date()
            );
            if (coupon) {
                discountAmount = Math.round((rawPrice * coupon.discount) / 100);
                appliedCouponCode = upperCode;
            }
        }

        const finalAmount = Math.max(0, rawPrice - discountAmount);

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const txnId = generateTxnId();
        const purchaseDate = new Date();
        const expiryDate = calcExpiryDate(planId);

        const newPayment = {
            txnId,
            user: user._id,
            userName: user.name,
            userEmail: user.email,
            planId,
            planName: plan.name,
            amount: finalAmount,
            currency,
            couponApplied: appliedCouponCode,
            discountAmount,
            status: 'Success',
            purchaseDate,
            expiryDate,
        };

        settings.payments.unshift(newPayment);
        await settings.save();

        user.subscribed = true;
        user.planType = plan.name;
        user.currency = currency;
        user.purchaseDate = purchaseDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
        user.expiryDate =
            planId === 'lifetime'
                ? 'Perpetual'
                : expiryDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                });

        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0';
        user.activityLog.push({
            action: `Subscribed to ${plan.name}`,
            ip: clientIp,
            device: req.headers['user-agent'] || 'Unknown',
            time: new Date(),
        });

        await user.save();

        return res.status(201).json({
            success: true,
            message: 'Subscription activated successfully',
            data: {
                txnId,
                planName: plan.name,
                amount: finalAmount,
                currency,
                discountAmount,
                couponApplied: appliedCouponCode,
                purchaseDate: user.purchaseDate,
                expiryDate: user.expiryDate,
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    subscribed: user.subscribed,
                    planType: user.planType,
                    currency: user.currency,
                    purchaseDate: user.purchaseDate,
                    expiryDate: user.expiryDate,
                },
            },
        });
    } catch (error) {
        console.error('purchaseSubscription error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  USER: Get own subscription details
//  GET /api/subscriptions/me
// ─────────────────────────────────────────────────────────────────────────────
const getMySubscription = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select(
            'name email subscribed planType currency purchaseDate expiryDate'
        );
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const settings = await SubscriptionSettings.getSingleton();

        let isExpired = false;
        if (user.subscribed && user.expiryDate && user.expiryDate !== 'Perpetual') {
            const expDate = new Date(user.expiryDate);
            if (!isNaN(expDate) && expDate < new Date()) {
                isExpired = true;
                const expiredPlanType = user.planType || 'Pro';
                user.subscribed = false;
                user.planType = 'Free';
                user.activityLog.push({
                    action: 'Subscription expired',
                    ip: '0.0.0.0',
                    device: 'System',
                    time: new Date(),
                });
                await user.save();

                // Create expired notification
                const Notification = require('../Models/Notification');
                await Notification.create({
                    user: user._id,
                    title: 'Subscription Expired',
                    message: `Your subscription to "${expiredPlanType}" plan has expired. Renew your plan to regain access to your enrolled courses.`,
                    type: 'subscription_expiry',
                    audience: 'expiring',
                });
            }
        }

        const userPayments = settings.payments
            .filter((p) => p.user?.toString() === user._id.toString())
            .sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate))
            .slice(0, 10);

        return res.status(200).json({
            success: true,
            data: {
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    subscribed: user.subscribed,
                    planType: user.planType,
                    currency: user.currency,
                    purchaseDate: user.purchaseDate,
                    expiryDate: user.expiryDate,
                },
                isExpired,
                paymentHistory: userPayments,
            },
        });
    } catch (error) {
        console.error('getMySubscription error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
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
};