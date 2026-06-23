const express = require('express');
const router = express.Router();
const {
  getSystemSettings,
  updateSystemSettings,
} = require('../Controllers/systemSettingsController');
const { protect, authorize } = require('../Middlewares/auth');

// Protected routes
router.get('/', protect, getSystemSettings);
router.put('/', protect, authorize('admin'), updateSystemSettings);

module.exports = router;
