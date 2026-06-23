const SystemSettings = require('../Models/SystemSettings');

// @desc    Get system settings (load or auto-initialize defaults)
// @route   GET /api/settings
// @access  Private
const getSystemSettings = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne({});
    if (!settings) {
      settings = await SystemSettings.create({});
    }
    return res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Error in getSystemSettings:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update system settings
// @route   PUT /api/settings
// @access  Private/Admin
const updateSystemSettings = async (req, res) => {
  try {
    let settings = await SystemSettings.findOne({});
    if (!settings) {
      settings = await SystemSettings.create({});
    }

    const fieldsToUpdate = [
      'subscriptionModeEnabled',
      'subscriptionPrice',
      'subscriptionCurrency',
      'appName',
      'logoText',
      'logoName',
      'activeTheme',
      'platformLang',
      'httpsEnforced',
      'jwtExpiry',
      'deviceLimit',
      'ipWhitelist',
      'cdnProvider',
      'cdnHost',
      'preBuffer',
      'androidVersion',
      'androidMinVersion',
      'androidForce',
      'iosVersion',
      'iosMinVersion',
      'iosForce',
      'smtpHost',
      'smtpPort',
      'smtpSecure',
      'smtpUser',
      'smtpPass',
      'paymentGateway',
      'stripePub',
      'stripeSec',
      'stripeSandbox',
    ];

    fieldsToUpdate.forEach((field) => {
      if (req.body[field] !== undefined) {
        settings[field] = req.body[field];
      }
    });

    const updatedSettings = await settings.save();

    return res.status(200).json({
      success: true,
      message: 'System settings updated successfully',
      data: updatedSettings,
    });
  } catch (error) {
    console.error('Error in updateSystemSettings:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getSystemSettings,
  updateSystemSettings,
};
