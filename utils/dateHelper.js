/**
 * Date helper utilities for user registration, purchases, and expiration calculation
 */

// Safely parse date string (including YYYY-MM-DD or standard strings) into Date object
const parseDateSafe = (dateVal) => {
  if (!dateVal) return null;
  if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? null : dateVal;
  if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

// Format a date object or string to standard display string: e.g. "Nov 5, 2026"
const formatDate = (date = new Date()) => {
  const d = parseDateSafe(date);
  if (!d) return typeof date === 'string' ? date : '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// Calculate expiry date exactly 2 months from a base date
const calculateTwoMonthsExpiry = (fromDate = new Date()) => {
  const base = parseDateSafe(fromDate) || new Date();
  const expiry = new Date(base);
  expiry.setMonth(expiry.getMonth() + 2);
  return formatDate(expiry);
};

// Check if an account expiry date has passed
// Allows access through the final millisecond of the expiration date (23:59:59.999)
const isAccountExpired = (expiryDateStr, userRole = 'user') => {
  if (userRole === 'admin') return false;
  if (!expiryDateStr || expiryDateStr === 'Perpetual') return false;

  const expiry = parseDateSafe(expiryDateStr);
  if (!expiry) return false;

  expiry.setHours(23, 59, 59, 999);
  return new Date() > expiry;
};

module.exports = {
  parseDateSafe,
  formatDate,
  calculateTwoMonthsExpiry,
  isAccountExpired,
};
