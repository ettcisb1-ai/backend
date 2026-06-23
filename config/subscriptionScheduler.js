const User = require('../Models/User');
const Notification = require('../Models/Notification');

/**
 * Checks all users' subscription statuses.
 * 1. Expires subscriptions that are past their expiry dates and notifies them.
 * 2. Warns users whose subscriptions are expiring in the next 3 days.
 */
const checkSubscriptionExpiries = async () => {
    try {
        console.log('[Subscription Service] Starting subscription expiry and warning check...');
        const now = new Date();
        const warningDays = 3;
        const warningCutoff = new Date(now.getTime() + warningDays * 24 * 60 * 60 * 1000);

        // Find all active subscribers
        const subscribedUsers = await User.find({ subscribed: true });
        console.log(`[Subscription Service] Found ${subscribedUsers.length} active subscriber(s) to verify.`);

        let expiredCount = 0;
        let warningCount = 0;

        for (const user of subscribedUsers) {
            if (!user.expiryDate || user.expiryDate === 'Perpetual') {
                continue;
            }

            const expDate = new Date(user.expiryDate);
            if (isNaN(expDate.getTime())) {
                console.warn(`[Subscription Service] Invalid expiryDate format for user ${user.email}: ${user.expiryDate}`);
                continue;
            }

            if (expDate < now) {
                // Subscription has expired
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
                await Notification.create({
                    user: user._id,
                    title: 'Subscription Expired',
                    message: `Your subscription to "${expiredPlanType}" plan has expired. Renew your plan to regain access to your enrolled courses.`,
                    type: 'subscription_expiry',
                    audience: 'expiring',
                });

                expiredCount++;
                console.log(`[Subscription Service] Expired subscription for user: ${user.email}`);
            } else if (expDate <= warningCutoff) {
                // Subscription will expire within 3 days
                // Check if they were already notified during their current cycle (since purchaseDate)
                let queryStart;
                if (user.purchaseDate) {
                    const parsedPurchase = new Date(user.purchaseDate);
                    queryStart = isNaN(parsedPurchase.getTime()) ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) : parsedPurchase;
                } else {
                    queryStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                }

                const alreadyNotified = await Notification.exists({
                    user: user._id,
                    type: 'subscription_expiry',
                    title: 'Subscription Expiring Soon',
                    createdAt: { $gte: queryStart },
                });

                if (!alreadyNotified) {
                    await Notification.create({
                        user: user._id,
                        title: 'Subscription Expiring Soon',
                        message: `Your subscription to "${user.planType}" plan is expiring soon on ${user.expiryDate}. Please renew to prevent service interruption.`,
                        type: 'subscription_expiry',
                        audience: 'expiring',
                    });

                    warningCount++;
                    console.log(`[Subscription Service] Sent subscription expiry warning to user: ${user.email}`);
                }
            }
        }

        console.log(`[Subscription Service] Check complete. Expired: ${expiredCount}, Warnings sent: ${warningCount}`);
    } catch (error) {
        console.error('[Subscription Service] Error during subscription check:', error);
    }
};

/**
 * Initializes the scheduler to run on server startup and then every 12 hours.
 */
const startSubscriptionScheduler = () => {
    // Run the check immediately on startup
    checkSubscriptionExpiries();

    // Run every 12 hours (12 * 60 * 60 * 1000 ms)
    setInterval(checkSubscriptionExpiries, 12 * 60 * 60 * 1000);
    console.log('[Subscription Service] Subscription scheduler initialized (running every 12 hours).');
};

module.exports = {
    checkSubscriptionExpiries,
    startSubscriptionScheduler,
};
