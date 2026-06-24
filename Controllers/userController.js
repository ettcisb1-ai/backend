const jwt = require('jsonwebtoken');
const User = require('../Models/User');
const Admin = require('../Models/Admin');

// Helper function to generate JWT
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Register a new user
// @route   POST /api/users/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, phoneNumber, password, role, profilePicture } = req.body;

    // Check if fields are provided
    if (!name || !email || !phoneNumber || !password) {
      return res.status(400).json({ success: false, message: 'Please provide name, email, phone number and password' });
    }

    // Check if user already exists in User collection
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }

    // Check if email is already taken in Admin collection to avoid conflicts
    const adminExists = await Admin.findOne({ email });
    if (adminExists) {
      return res.status(400).json({ success: false, message: 'This email is registered as an Admin account' });
    }

    // Capture client IP address and device from request headers
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '192.168.10.45';
    const userAgent = req.headers['user-agent'] || 'Unknown Device';

    // Create user
    const user = await User.create({
      name,
      email,
      phoneNumber,
      password,
      role: 'user',
      profilePicture,
      ip: clientIp,
      registeredIp: clientIp,
      ipLockEnabled: req.body.ipLockEnabled !== undefined ? req.body.ipLockEnabled : false,
      subscribed: req.body.subscribed !== undefined ? req.body.subscribed : false,
      planType: req.body.planType || 'Free',
      currency: req.body.currency || 'PKR',
      purchaseDate: req.body.purchaseDate || 'May 10, 2026',
      expiryDate: req.body.expiryDate || 'June 10, 2026',
      activityLog: [
        { action: 'Account Created', ip: clientIp, device: userAgent, time: new Date() }
      ]
    });

    if (user) {
      return res.status(201).json({
        success: true,
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role,
          profilePicture: user.profilePicture,
          ip: user.ip,
          registeredIp: user.registeredIp,
          ipLockEnabled: user.ipLockEnabled,
          subscribed: user.subscribed,
          planType: user.planType,
          currency: user.currency,
          purchaseDate: user.purchaseDate,
          expiryDate: user.expiryDate,
          courses: user.courses || [],
          token: generateToken(user._id, user.role),
        },
      });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid user data' });
    }
  } catch (error) {
    console.error('Error in registerUser:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    // Find user (explicitly selecting password since it is hidden by default)
    const user = await User.findOne({ email }).select('+password');

    if (user && (await user.comparePassword(password))) {
      if (!user.isActive) {
        return res.status(403).json({ success: false, message: 'Your account is inactive.' });
      }

      // Capture client IP address from the request
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '192.168.10.45';

      // Enforce IP Lock restriction
      if (user.ipLockEnabled && user.registeredIp && clientIp !== user.registeredIp) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Login attempted from an unauthorized IP address.',
          data: {
            ipLocked: true,
            registeredIp: user.registeredIp,
            currentIp: clientIp
          }
        });
      }

      // Clean up expired tokens from activeSessions
      const jwt = require('jsonwebtoken');
      const validSessions = (user.activeSessions || []).filter(token => {
        try {
          jwt.verify(token, process.env.JWT_SECRET);
          return true;
        } catch {
          return false; // expired or invalid — remove it
        }
      });
      user.activeSessions = validSessions;

      // Enforce device limit
      const limit = user.deviceLimit || 1;
      if (validSessions.length >= limit) {
        return res.status(403).json({
          success: false,
          message: `Device limit reached. You are allowed to log in on ${limit} device(s) only. Please log out from another device.`,
        });
      }

      user.ip = clientIp;

      // Generate token first so we can store it in activeSessions
      const newToken = generateToken(user._id, user.role);
      user.activeSessions.push(newToken);

      // Log successful login activity
      const isIpMismatch = user.registeredIp && clientIp !== user.registeredIp;
      const actionMessage = isIpMismatch ? 'Logged in from new IP' : 'Logged in';

      user.activityLog.push({
        action: actionMessage,
        ip: clientIp,
        device: req.headers['user-agent'] || 'Unknown Device',
        time: new Date(),
      });

      await user.save();

      return res.json({
        success: true,
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role,
          profilePicture: user.profilePicture,
          ip: user.ip,
          registeredIp: user.registeredIp,
          ipLockEnabled: user.ipLockEnabled,
          subscribed: user.subscribed,
          planType: user.planType,
          currency: user.currency,
          purchaseDate: user.purchaseDate,
          expiryDate: user.expiryDate,
          courses: user.courses || [],
          token: newToken,
        },
      });
    } else {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error('Error in loginUser:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      return res.json({
        success: true,
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role,
          profilePicture: user.profilePicture,
          isActive: user.isActive,
          ip: user.ip,
          registeredIp: user.registeredIp,
          ipLockEnabled: user.ipLockEnabled,
          subscribed: user.subscribed,
          planType: user.planType,
          currency: user.currency,
          purchaseDate: user.purchaseDate,
          expiryDate: user.expiryDate,
          courses: user.courses || [],
          createdAt: user.createdAt,
        },
      });
    } else {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
  } catch (error) {
    console.error('Error in getUserProfile:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update user profile details or preferences
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Update basic details if provided
    if (req.body.name) user.name = req.body.name;
    if (req.body.email) {
      const emailExists = await User.findOne({ email: req.body.email });
      if (emailExists && emailExists._id.toString() !== user._id.toString()) {
        return res.status(400).json({ success: false, message: 'Email already in use by another account' });
      }
      user.email = req.body.email;
    }
    if (req.body.phoneNumber) {
      user.phoneNumber = req.body.phoneNumber;
    }
    if (req.body.password) {
      const { currentPassword } = req.body;
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required to change password' });
      }
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }
      user.password = req.body.password;
    }

    // IP Security & Simulation properties
    if (req.body.ipLockEnabled !== undefined) {
      user.ipLockEnabled = req.body.ipLockEnabled;
    }
    if (req.body.ip) {
      user.ip = req.body.ip;
    }
    if (req.body.registeredIp) {
      user.registeredIp = req.body.registeredIp;
    }

    // Subscription details
    if (req.body.subscribed !== undefined) {
      user.subscribed = req.body.subscribed;
    }
    if (req.body.planType) {
      user.planType = req.body.planType;
    }

    // Profile picture
    if (req.body.profilePicture !== undefined) {
      user.profilePicture = req.body.profilePicture;
    }

    const updatedUser = await user.save();

    return res.json({
      success: true,
      data: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber,
        role: updatedUser.role,
        profilePicture: updatedUser.profilePicture,
        ip: updatedUser.ip,
        registeredIp: updatedUser.registeredIp,
        ipLockEnabled: updatedUser.ipLockEnabled,
        subscribed: updatedUser.subscribed,
        planType: updatedUser.planType,
        currency: updatedUser.currency,
        purchaseDate: updatedUser.purchaseDate,
        expiryDate: updatedUser.expiryDate,
        courses: updatedUser.courses || [],
        token: generateToken(updatedUser._id, updatedUser.role),
      },
    });
  } catch (error) {
    console.error('Error in updateUserProfile:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Forgot password
// @route   POST /api/users/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found with this email' });
    }

    // Get reset token
    const resetToken = user.getResetPasswordToken();

    await user.save({ validateBeforeSave: false });

    // Create reset url
    const resetUrl = `${req.protocol}://${req.get('host')}/api/users/reset-password/${resetToken}`;

    console.log(`[DEV] Password reset link for ${email}: ${resetUrl}`);

    return res.status(200).json({
      success: true,
      message: 'Email link generated (check server console in development)',
      data: {
        resetUrl,
      },
    });
  } catch (error) {
    console.error('Error in forgotPassword:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reset password
// @route   PUT /api/users/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const crypto = require('crypto');
    // Get hashed token
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token' });
    }

    // Set new password
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password reset successful',
    });
  } catch (error) {
    console.error('Error in resetPassword:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Logout user — removes token from activeSessions
// @route   POST /api/users/logout
// @access  Private
const logoutUser = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const user = await User.findById(req.user._id);
    if (user && token) {
      user.activeSessions = (user.activeSessions || []).filter(t => t !== token);
      await user.save();
    }
    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Error in logoutUser:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  forgotPassword,
  resetPassword,
  logoutUser,
};
