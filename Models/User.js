const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email address',
      ],
    },
    phoneNumber: {
        type: String,
        required: [true, 'Please provide a phone number'],
        trim: true,
      },
      password: {
        type: String,
        required: [true, 'Please provide a password'],
        minlength: [6, 'Password must be at least 6 characters long'],
        select: false, // Don't return password hash by default in queries
      },
      role: {
        type: String,
        default: 'user',
      },
      profilePicture: {
        type: String,
        default: '',
      },
      isActive: {
        type: Boolean,
        default: true,
      },
      ip: {
        type: String,
        default: '192.168.10.45',
      },
      registeredIp: {
        type: String,
        default: '192.168.10.45',
      },
      ipLockEnabled: {
        type: Boolean,
        default: false,
      },
      deviceLimit: {
        type: Number,
        default: 1,
        min: 1,
        max: 10,
      },
      activeSessions: {
        type: [String], // stores active JWT tokens
        default: [],
      },
      subscribed: {
        type: Boolean,
        default: false,
      },
      planType: {
        type: String,
        default: 'Free',
      },
      currency: {
        type: String,
        default: 'PKR',
      },
      purchaseDate: {
        type: String,
        default: 'May 10, 2026',
      },
      expiryDate: {
        type: String,
        default: 'June 10, 2026',
      },
      resetPasswordToken: String,
      resetPasswordExpire: Date,
      activityLog: [
        {
          action: { type: String, required: true },
          ip: { type: String, required: true },
          device: { type: String, default: 'Unknown' },
          time: { type: Date, default: Date.now },
        }
      ],
      watchHistory: [
        {
          title: { type: String, required: true },
          duration: { type: String, required: true },
          date: { type: Date, default: Date.now },
        }
      ],
      courses: {
        type: [String],
        default: [],
      },
    },
  {
    timestamps: true,
  }
);

// Encrypt password using bcrypt before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate and hash password token
userSchema.methods.getResetPasswordToken = function () {
  // Generate token
  const resetToken = crypto.randomBytes(20).toString('hex');

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expire (10 minutes)
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

module.exports = mongoose.model('User', userSchema);
