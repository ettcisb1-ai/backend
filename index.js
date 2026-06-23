require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const userRoutes = require('./Routes/userRoute');
const adminRoutes = require('./Routes/adminRoute');
const categorieRoutes = require('./Routes/categorieRoute');
const courseRoutes = require('./Routes/courseRoute');
const uploadRoutes = require('./Routes/uploadRoute');
const videoRoutes = require('./Routes/videoRoute');
// const systemSettingsRoutes = require('./Routes/systemSettingsRoute');
const subscriptionRoutes = require('./Routes/subscriptionRoute');
const notificationRoutes = require('./Routes/notificationRoute');   // FR-43/44/45
const progressRoutes = require('./Routes/progressRoute');           // FR-46/47/48
const analyticsRoutes = require('./Routes/analyticsRoute');         // Analytics API
const reportsRoutes = require('./Routes/reportsRoute');             // Reports API

// Initialize express app
const app = express();

const path = require('path');
const fs = require('fs');

// On Vercel (serverless) the filesystem is read-only — only /tmp is writable.
// We skip local uploads dir creation in production; S3 handles storage.
try {
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  // Serve local uploads only in development
  if (process.env.NODE_ENV !== 'production') {
    app.use('/uploads', express.static(uploadsDir));
  }
} catch (e) {
  // Silently skip — running on read-only serverless (Vercel)
}

// ── CORS Configuration ────────────────────────────────────────────────────────
// Explicitly allow known frontend origins (local dev + Vercel deployment)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  // Add any other Vercel preview URLs here if needed
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: Origin '${origin}' is not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200, // Some browsers (IE11) choke on 204
};

// Handle preflight OPTIONS for all routes — use regex (newer path-to-regexp rejects '*')
app.options(/(.*)/, cors(corsOptions));
app.use(cors(corsOptions));

// Global Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure database connection is ready before handling any request (critical for serverless / Vercel)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    next(new Error(`Database Connection Failed: ${error.message}`));
  }
});


// Basic Health Check Route
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'LMS Backend Server is running smoothly!',
    timestamp: new Date(),
  });
});

// Mounting API Routes
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/categories', categorieRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/videos', videoRoutes);
// app.use('/api/settings', systemSettingsRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/notifications', notificationRoutes);   // FR-43/44/45
app.use('/api/progress', progressRoutes);            // FR-46/47/48
app.use('/api/analytics', analyticsRoutes);          // Analytics
app.use('/api/reports', reportsRoutes);              // Reports

// Fallback 404 Route
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Resource not found - ${req.originalUrl}`,
  });
});

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.stack);

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

// Connect to MongoDB & Start Server
const startServer = async () => {
  if (process.env.VERCEL) {
    // On Vercel, connection is handled via request middleware.
    // No need to block file load or run schedulers.
    return;
  }

  try {
    await connectDB();

    // Start daily subscription status and reminder checks
    const { startSubscriptionScheduler } = require('./config/subscriptionScheduler');
    startSubscriptionScheduler();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;