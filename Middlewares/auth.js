const jwt = require('jsonwebtoken');
const User = require('../Models/User');
const Admin = require('../Models/Admin');

// Protect route - verify token and attach user/admin to request
const protect = async (req, res, next) => {
  let token;

  // Check if authorization header exists and starts with Bearer
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if user is an Admin or a regular User
      if (decoded.role === 'admin') {
        const admin = await Admin.findById(decoded.id).select('-password');
        if (!admin) {
          return res.status(401).json({ success: false, message: 'Not authorized, admin not found' });
        }
        req.user = admin; // Attach as req.user (role is admin)
      } else {
        const user = await User.findById(decoded.id).select('-password');
        if (!user) {
          return res.status(401).json({ success: false, message: 'Not authorized, user not found' });
        }
        if (!user.isActive) {
          return res.status(403).json({ success: false, message: 'User account is deactivated' });
        }
        // Check if this token is still in activeSessions (force logout support)
        if (user.activeSessions && user.activeSessions.length > 0) {
          if (!user.activeSessions.includes(token)) {
            return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
          }
        }
        req.user = user;
      }

      next();
    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
  }
};

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user ? req.user.role : 'anonymous'}' is not authorized to access this route`,
      });
    }
    next();
  };
};

module.exports = {
  protect,
  authorize,
};
