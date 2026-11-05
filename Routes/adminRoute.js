const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  registerAdmin,
  loginAdmin,
  getAdminProfile,
  getAllUsers,
  adminCreateUser,
  adminUpdateUser,
  adminToggleUserStatus,
  adminDeleteUser,
  getUserActivity,
  getDashboardStats,
  assignCoursesToUser,
  setUserDeviceLimit,
  forceLogoutUser,
} = require('../Controllers/adminController');
const { protect, authorize } = require('../Middlewares/auth');

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // max 10 login attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
});

// ── Admin Register — Protected by secret key ──────────────────────────────────
// CRITICAL: This route is NOT publicly open.
// Caller must pass the correct ADMIN_REGISTRATION_SECRET in the request body.
// In production: set ADMIN_REGISTRATION_SECRET as a strong random env variable.
const adminRegisterGuard = (req, res, next) => {
  const secret = process.env.ADMIN_REGISTRATION_SECRET;
  if (!secret || req.body.registrationSecret !== secret) {
    return res.status(403).json({
      success: false,
      message: 'Admin registration is restricted. Invalid or missing registration secret.',
    });
  }
  next();
};

// Public routes
router.post('/register', adminRegisterGuard, registerAdmin); // Guarded by secret
router.post('/login', loginLimiter, loginAdmin);

// Protected routes (Admin only)
router.get('/profile', protect, authorize('admin'), getAdminProfile);
router.get('/dashboard', protect, authorize('admin'), getDashboardStats);
router.get('/users', protect, authorize('admin'), getAllUsers);
router.post('/users', protect, authorize('admin'), adminCreateUser);
router.put('/users/:id', protect, authorize('admin'), adminUpdateUser);
router.patch('/users/:id/status', protect, authorize('admin'), adminToggleUserStatus);
router.delete('/users/:id', protect, authorize('admin'), adminDeleteUser);
router.get('/users/:id/activity', protect, authorize('admin'), getUserActivity);

// FR-28: Dedicated course assignment endpoint
router.put('/users/:id/courses', protect, authorize('admin'), assignCoursesToUser);

// Device limit management
router.patch('/users/:id/device-limit', protect, authorize('admin'), setUserDeviceLimit);

// Force logout — clears all active sessions
router.patch('/users/:id/force-logout', protect, authorize('admin'), forceLogoutUser);

module.exports = router;
