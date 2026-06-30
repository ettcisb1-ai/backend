const jwt = require('jsonwebtoken');
const Admin = require('../Models/Admin');
const User = require('../Models/User');
const Course = require('../Models/Course');
const Video = require('../Models/Video');

// Helper function to generate JWT
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Register a new admin
// @route   POST /api/admin/register
// @access  Public
const registerAdmin = async (req, res) => {
  try {
    const { name, email, password, superAdmin } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide name, email and password' });
    }

    // Check if email already exists in Admin
    const adminExists = await Admin.findOne({ email });
    if (adminExists) {
      return res.status(400).json({ success: false, message: 'Admin already exists with this email' });
    }

    // Check if email exists in User
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'This email is already registered as a user account' });
    }

    // Create admin
    const admin = await Admin.create({
      name,
      email,
      password,
      role: 'admin',
      superAdmin: superAdmin || false,
    });

    if (admin) {
      return res.status(201).json({
        success: true,
        data: {
          _id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          superAdmin: admin.superAdmin,
          token: generateToken(admin._id, admin.role),
        },
      });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid admin data' });
    }
  } catch (error) {
    console.error('Error in registerAdmin:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Auth admin & get token
// @route   POST /api/admin/login
// @access  Public
const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    // Find admin and select password
    const admin = await Admin.findOne({ email }).select('+password');

    if (admin && (await admin.comparePassword(password))) {
      return res.json({
        success: true,
        data: {
          _id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          superAdmin: admin.superAdmin,
          token: generateToken(admin._id, admin.role),
        },
      });
    } else {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error('Error in loginAdmin:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get admin profile
// @route   GET /api/admin/profile
// @access  Private
const getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.user._id);

    if (admin) {
      return res.json({
        success: true,
        data: {
          _id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          superAdmin: admin.superAdmin,
          createdAt: admin.createdAt,
        },
      });
    } else {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }
  } catch (error) {
    console.error('Error in getAdminProfile:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all registered users
// @route   GET /api/admin/users
// @access  Private
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).sort('-createdAt');
    return res.json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error('Error in getAllUsers:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Admin create new user account
// @route   POST /api/admin/users
// @access  Private/Admin
const adminCreateUser = async (req, res) => {
  try {
    const { name, email, phoneNumber, password, role, subscription } = req.body;

    if (!name || !email || !phoneNumber || !password) {
      return res.status(400).json({ success: false, message: 'Please provide name, email, phone number and password' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '192.168.10.45';

    let expiryDate = '';
    let purchaseDate = '';
    if (subscription === 'Pro (Paid)') {
      const oneMonthFromNow = new Date();
      oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
      expiryDate = oneMonthFromNow.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      purchaseDate = new Date().toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    }

    const user = await User.create({
      name,
      email,
      phoneNumber,
      password,
      role: role || 'user',
      registeredIp: clientIp,
      ip: clientIp,
      subscribed: subscription === 'Pro (Paid)',
      planType: subscription === 'Pro (Paid)' ? 'Pro' : 'Free',
      expiryDate,
      purchaseDate,
      activityLog: [
        { action: 'Account Created', ip: clientIp, device: 'System/Admin', time: new Date() }
      ]
    });

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user,
    });
  } catch (error) {
    console.error('Error in adminCreateUser:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Admin edit user account
// @route   PUT /api/admin/users/:id
// @access  Private/Admin
const adminUpdateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { name, email, phoneNumber, role, status, subscription, password, courses } = req.body;

    if (name) user.name = name;
    if (email) {
      const emailExists = await User.findOne({ email });
      if (emailExists && emailExists._id.toString() !== user._id.toString()) {
        return res.status(400).json({ success: false, message: 'Email already in use by another account' });
      }
      user.email = email;
    }
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (role) user.role = role;
    if (status !== undefined && status !== null && status !== '') {
      // Map frontend display value to DB enum
      const statusMap = { 'Active': 'active', 'Inactive': 'inactive' };
      const dbStatus = statusMap[status] || status.toLowerCase();
      user.status = dbStatus;
      // Keep isActive in sync — only 'active' allows login
      user.isActive = (dbStatus === 'active');
    }    if (subscription) {
      user.subscribed = (subscription === 'Pro (Paid)');
      user.planType = (subscription === 'Pro (Paid)' ? 'Pro' : 'Free');
      // When manually granting Pro access, set a 1-month expiry if none is set or it's in the past
      if (subscription === 'Pro (Paid)') {
        const currentExpiry = user.expiryDate ? new Date(user.expiryDate) : null;
        const needsExpiry = !currentExpiry || isNaN(currentExpiry) || currentExpiry < new Date();
        if (needsExpiry) {
          const oneMonthFromNow = new Date();
          oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
          user.expiryDate = oneMonthFromNow.toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          });
          user.purchaseDate = new Date().toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          });
        }
      } else {
        // Downgrading to Free — clear subscription dates
        user.expiryDate = '';
        user.purchaseDate = '';
      }
    }
    if (password) user.password = password;
    let newlyAddedCourses = [];
    if (courses !== undefined) {
      const previousCourses = (user.courses || []).map(c => c.toString());
      newlyAddedCourses = courses.filter(id => id && !previousCourses.includes(id.toString()));
      user.courses = courses;
    }

    const updatedUser = await user.save();

    if (newlyAddedCourses.length > 0) {
      try {
        const Notification = require('../Models/Notification');
        const mongoose = require('mongoose');
        const validIds = newlyAddedCourses.filter(id => mongoose.Types.ObjectId.isValid(id));
        const coursesInfo = await Course.find({ _id: { $in: validIds } }).select('title');
        
        const notificationDocs = coursesInfo.map(course => ({
          user: user._id,
          title: 'New Course Assigned',
          message: `You have been enrolled in the course "${course.title}".`,
          type: 'broadcast',
          course: course._id,
          audience: 'all',
        }));
        
        await Notification.insertMany(notificationDocs);
      } catch (notifErr) {
        console.error('Error sending course assignment notifications in adminUpdateUser:', notifErr);
      }
    }

    return res.json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser,
    });
  } catch (error) {
    console.error('Error in adminUpdateUser:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Admin deactivate/activate user
// @route   PATCH /api/admin/users/:id/status
// @access  Private/Admin
const adminToggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isActive = req.body.isActive !== undefined ? req.body.isActive : !user.isActive;
    user.status = user.isActive ? 'active' : 'inactive';
    const updatedUser = await user.save();

    return res.json({
      success: true,
      message: `User ${updatedUser.isActive ? 'activated' : 'deactivated'} successfully`,
      data: updatedUser,
    });
  } catch (error) {
    console.error('Error in adminToggleUserStatus:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Admin remove user account
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
const adminDeleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await user.deleteOne();

    return res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Error in adminDeleteUser:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Admin monitor user activity
// @route   GET /api/admin/users/:id/activity
// @access  Private/Admin
const getUserActivity = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('activityLog watchHistory name email');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        activityLog: user.activityLog,
        watchHistory: user.watchHistory,
      },
    });
  } catch (error) {
    console.error('Error in getUserActivity:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get aggregated dashboard statistics
// @route   GET /api/admin/dashboard
// @access  Private/Admin
const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const last30d = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const last8d = new Date(now - 8 * 24 * 60 * 60 * 1000);

    // ── Basic counts ──────────────────────────────────────────────────────────
    const [totalUsers, totalCourses, totalVideos, activeSubscriptions, expiredSubscriptions, newRegistrations] = await Promise.all([
      User.countDocuments(),
      Course.countDocuments(),
      Video.countDocuments(),
      User.countDocuments({ subscribed: true }),
      User.countDocuments({ subscribed: false, planType: 'Pro' }),
      User.countDocuments({ createdAt: { $gte: last30d } }),
    ]);

    // ── Active users: had a login event in the last 24 h ─────────────────────
    const activeUsers = await User.countDocuments({
      activityLog: {
        $elemMatch: {
          action: { $regex: /(logged|login)/i },
          time: { $gte: last24h },
        },
      },
    });

    // ── Daily Active Users chart (last 8 days) ────────────────────────────────
    const dauRaw = await User.aggregate([
      { $unwind: '$activityLog' },
      {
        $match: {
          'activityLog.action': { $regex: /(logged|login)/i },
          'activityLog.time': { $gte: last8d },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%b %d', date: '$activityLog.time' } },
          users: { $addToSet: '$_id' },
        },
      },
      { $project: { _id: 0, day: '$_id', users: { $size: '$users' } } },
      { $sort: { day: 1 } },
    ]);

    // ── User Growth chart (cumulative by month) ───────────────────────────────
    const growthRaw = await User.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let cumulative = 0;
    const userGrowth = growthRaw.map(d => {
      cumulative += d.count;
      return { month: monthNames[d._id.month - 1], total: cumulative };
    });

    // ── Course Popularity (top 5 by studentsCount) ────────────────────────────
    const popularCourses = await Course.find({})
      .sort({ studentsCount: -1 })
      .limit(5)
      .select('title studentsCount');
    const coursePopularity = popularCourses.map(c => ({ name: c.title, students: c.studentsCount }));

    // ── Recent Logins (last 5 login events across all users) ──────────────────
    const recentLoginsRaw = await User.aggregate([
      { $unwind: '$activityLog' },
      { $match: { 'activityLog.action': { $regex: /(logged|login)/i } } },
      { $sort: { 'activityLog.time': -1 } },
      { $limit: 5 },
      {
        $project: {
          name: 1,
          email: 1,
          time: '$activityLog.time',
          device: '$activityLog.device',
        },
      },
    ]);

    // ── Recent Registrations (last 5 users) ───────────────────────────────────
    const recentRegistrations = await User.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email planType createdAt');

    // ── Recent Videos (last 5 uploads) ───────────────────────────────────────
    const recentVideos = await Video.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('course', 'title')
      .select('title size course createdAt');

    return res.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          activeUsers,
          totalCourses,
          totalVideos,
          activeSubscriptions,
          expiredSubscriptions,
          newRegistrations,
        },
        charts: {
          dailyActiveUsers: dauRaw,
          userGrowth,
          coursePopularity,
        },
        activity: {
          recentLogins: recentLoginsRaw,
          recentRegistrations,
          recentVideos,
        },
      },
    });
  } catch (error) {
    console.error('Error in getDashboardStats:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


// @desc    Assign or revoke courses for a user (FR-28)
// @route   PUT /api/admin/users/:id/courses
// @access  Private/Admin
const assignCoursesToUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { courseIds } = req.body;
    if (!Array.isArray(courseIds)) {
      return res.status(400).json({ success: false, message: 'courseIds must be an array' });
    }

    const mongoose = require('mongoose');

    // Filter to syntactically valid ObjectIds first
    const syntacticallyValid = courseIds.filter(id => mongoose.Types.ObjectId.isValid(id));

    // Then query DB — only keep IDs that actually exist as Course documents.
    // This makes the endpoint resilient to deleted courses or stale IDs.
    const foundCourses = await Course.find({ _id: { $in: syntacticallyValid } })
      .select('_id title studentsCount');

    const existingIds = new Set(foundCourses.map(c => c._id.toString()));

    // Final list: only IDs that are both valid ObjectIds AND exist in DB
    const newCourseIds = syntacticallyValid
      .map(id => id.toString())
      .filter(id => existingIds.has(id));

    // Silently report how many were skipped (useful for debugging)
    const skipped = courseIds.length - newCourseIds.length;
    if (skipped > 0) {
      console.warn(`assignCoursesToUser: ${skipped} course ID(s) skipped (not found or invalid)`);
    }

    const previousCourseIds = (user.courses || []).map(c => c.toString());

    // Courses being added (not in previous list)
    const added = newCourseIds.filter(id => !previousCourseIds.includes(id));
    // Courses being removed (in previous list but not in new list)
    const removed = previousCourseIds.filter(id => !newCourseIds.includes(id) && mongoose.Types.ObjectId.isValid(id));

    // Update studentsCount on Course documents
    if (added.length > 0) {
      await Course.updateMany({ _id: { $in: added } }, { $inc: { studentsCount: 1 } });
    }
    if (removed.length > 0) {
      // Decrement studentsCount but never below 0.
      // Use two-step: first decrement only those with count > 0,
      // then ensure no negatives remain (belt-and-suspenders).
      await Course.updateMany(
        { _id: { $in: removed }, studentsCount: { $gt: 0 } },
        { $inc: { studentsCount: -1 } }
      );
    }

    // Save new course IDs to user
    user.courses = newCourseIds;
    await user.save();

    // Send notification for newly assigned courses
    if (added.length > 0) {
      try {
        const Notification = require('../Models/Notification');
        const newlyAssignedCourses = await Course.find({ _id: { $in: added } }).select('title');
        
        const notificationDocs = newlyAssignedCourses.map(course => ({
          user: user._id,
          title: 'New Course Assigned',
          message: `You have been enrolled in the course "${course.title}".`,
          type: 'broadcast',
          course: course._id,
          audience: 'all',
        }));
        
        await Notification.insertMany(notificationDocs);
      } catch (notifErr) {
        console.error('Error sending course assignment notifications in assignCoursesToUser:', notifErr);
      }
    }

    // Return the updated user with course details populated
    const updatedUser = await User.findById(user._id).lean();
    const assignedCourses = await Course.find({ _id: { $in: newCourseIds } })
      .populate('category', 'name')
      .select('_id title category difficulty price thumbnail instructor videosCount studentsCount')
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Course access updated successfully',
      data: {
        userId: updatedUser._id,
        userName: updatedUser.name,
        courses: user.courses,
        assignedCourseDetails: assignedCourses,
      },
    });
  } catch (error) {
    console.error('Error in assignCoursesToUser:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Force logout a user — clears all active sessions
// @route   PATCH /api/admin/users/:id/force-logout
// @access  Private/Admin
const forceLogoutUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    user.activeSessions = [];
    await user.save();
    return res.json({ success: true, message: 'User sessions cleared successfully' });
  } catch (error) {
    console.error('Error in forceLogoutUser:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Set device limit for a user
// @route   PATCH /api/admin/users/:id/device-limit
// @access  Private/Admin
const setUserDeviceLimit = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { deviceLimit } = req.body;
    if (deviceLimit === undefined || deviceLimit < 1 || deviceLimit > 10) {
      return res.status(400).json({ success: false, message: 'Device limit must be between 1 and 10' });
    }

    user.deviceLimit = deviceLimit;
    await user.save();

    return res.json({
      success: true,
      message: `Device limit set to ${deviceLimit}`,
      data: { deviceLimit: user.deviceLimit }
    });
  } catch (error) {
    console.error('Error in setUserDeviceLimit:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
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
};