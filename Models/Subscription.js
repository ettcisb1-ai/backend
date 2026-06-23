const mongoose = require('mongoose');

// Individual plan pricing schema
const planPricingSchema = new mongoose.Schema(
    {
        PKR: { type: Number, default: 0 },
        USD: { type: Number, default: 0 },
        EUR: { type: Number, default: 0 },
    },
    { _id: false }
);

// Subscription plan schema
// NOTE: planId enum removed so admins can create custom plans dynamically
const subscriptionPlanSchema = new mongoose.Schema(
    {
        planId: {
            type: String,
            required: true,
        },
        name: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            default: '',
        },
        isEnabled: {
            type: Boolean,
            default: true,
        },
        pricing: {
            type: planPricingSchema,
            default: () => ({ PKR: 0, USD: 0, EUR: 0 }),
        },
    },
    { _id: false }
);

// Coupon schema
const couponSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            uppercase: true,
            trim: true,
        },
        discount: {
            type: Number,
            required: true,
            min: 1,
            max: 100,
        },
        expiry: {
            type: Date,
            required: true,
        },
        status: {
            type: String,
            enum: ['Active', 'Expired'],
            default: 'Active',
        },
    },
    { timestamps: true }
);

// Payment / Transaction schema
const paymentSchema = new mongoose.Schema(
    {
        txnId: {
            type: String,
            required: true,
            unique: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        userName: { type: String, default: '' },
        userEmail: { type: String, default: '' },
        planId: { type: String, required: true },
        planName: { type: String, required: true },
        amount: { type: Number, required: true },
        currency: { type: String, default: 'PKR' },
        couponApplied: { type: String, default: '' },
        discountAmount: { type: Number, default: 0 },
        status: {
            type: String,
            enum: ['Success', 'Failed', 'Refunded', 'Pending'],
            default: 'Pending',
        },
        purchaseDate: { type: Date, default: Date.now },
        expiryDate: { type: Date, default: null },
    },
    { timestamps: true }
);

// Root subscription settings model (singleton – one doc per platform)
const subscriptionSettingsSchema = new mongoose.Schema(
    {
        // FR-35: Free vs Paid mode
        subscriptionModeEnabled: {
            type: Boolean,
            default: true,
        },
        portalMode: {
            type: String,
            enum: ['free', 'paid'],
            default: 'paid',
        },

        // Trial settings
        hasTrial: { type: Boolean, default: false },
        trialDays: { type: Number, default: 14 },

        // FR-39: Supported currencies
        enabledCurrencies: {
            PKR: { type: Boolean, default: true },
            USD: { type: Boolean, default: true },
            EUR: { type: Boolean, default: true },
        },

        // FR-37 / FR-40: Plans with multi-currency pricing (no enum on planId)
        // No default plans — admin creates all plans via the UI
        plans: {
            type: [subscriptionPlanSchema],
            default: [],
        },

        // Coupons
        coupons: { type: [couponSchema], default: [] },

        // Payments / Transactions log
        payments: { type: [paymentSchema], default: [] },
    },
    { timestamps: true }
);

// Statics: always get or create the singleton settings doc
subscriptionSettingsSchema.statics.getSingleton = async function () {
    let settings = await this.findOne({});
    if (!settings) {
        settings = await this.create({});
    }
    return settings;
};

const SubscriptionSettings = mongoose.model('SubscriptionSettings', subscriptionSettingsSchema);

module.exports = SubscriptionSettings;