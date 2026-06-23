const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema(
  {
    subscriptionModeEnabled: {
      type: Boolean,
      default: true,
    },
    subscriptionPrice: {
      type: Number,
      default: 2000,
    },
    subscriptionCurrency: {
      type: String,
      default: 'PKR',
    },
    appName: {
      type: String,
      default: 'LMS Portal',
    },
    logoText: {
      type: String,
      default: 'L',
    },
    logoName: {
      type: String,
      default: 'LMS Portal Dashboard',
    },
    activeTheme: {
      type: String,
      default: 'coral',
    },
    platformLang: {
      type: String,
      default: 'English',
    },
    httpsEnforced: {
      type: Boolean,
      default: true,
    },
    jwtExpiry: {
      type: Number,
      default: 24,
    },
    deviceLimit: {
      type: String,
      default: '3',
    },
    ipWhitelist: {
      type: String,
      default: '',
    },
    cdnProvider: {
      type: String,
      default: 'cloudflare',
    },
    cdnHost: {
      type: String,
      default: 'cdn.lmsportal.com',
    },
    preBuffer: {
      type: Number,
      default: 5,
    },
    androidVersion: {
      type: String,
      default: '2.4.1',
    },
    androidMinVersion: {
      type: String,
      default: '2.0.0',
    },
    androidForce: {
      type: Boolean,
      default: true,
    },
    iosVersion: {
      type: String,
      default: '2.4.0',
    },
    iosMinVersion: {
      type: String,
      default: '2.0.0',
    },
    iosForce: {
      type: Boolean,
      default: false,
    },
    smtpHost: {
      type: String,
      default: 'smtp.mailgun.org',
    },
    smtpPort: {
      type: String,
      default: '587',
    },
    smtpSecure: {
      type: String,
      default: 'TLS',
    },
    smtpUser: {
      type: String,
      default: 'postmaster@mg.lmsportal.com',
    },
    smtpPass: {
      type: String,
      default: '••••••••••••••••••••••••',
    },
    paymentGateway: {
      type: String,
      default: 'stripe',
    },
    stripePub: {
      type: String,
      default: 'pk_test_51Nx8Z2B...',
    },
    stripeSec: {
      type: String,
      default: '••••••••••••••••••••••••••••••••',
    },
    stripeSandbox: {
      type: Boolean,
      default: true,
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
