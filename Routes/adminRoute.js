const express = require('express');
const router = express.Router();
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

// Public routes
router.post('/register', registerAdmin);
router.post('/login', loginAdmin);

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