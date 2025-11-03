const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// env
dotenv.config();

const app = express();


const pool = require('./config/db');
const User = require('./models/User');
const Deadline = require('./models/Deadline');
const Friend = require('./models/Friend');
const DeadlineCollaborator = require('./models/DeadlineCollaborator');
const InAppNotification = require('./models/InAppNotification');

// services
const emailService = require('./services/emailService');
const notificationService = require('./services/notificationService');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For form data


// Database initialization with retry — don't crash the process on DB unreachable
let dbInitialized = false;
const DB_RETRY_DELAY = 15 * 1000; // 15 seconds

const initializeDatabase = async () => {
  // Use the checkConnection helper exported by config/db.js
  try {
    const ok = typeof pool.checkConnection === 'function' ? await pool.checkConnection() : false;

    if (!ok) {
      console.error('❌ Database not reachable during startup. Server will continue in degraded mode and retry in background.');
      // Schedule a retry
      setTimeout(initializeDatabase, DB_RETRY_DELAY);
      return;
    }

    if (dbInitialized) return; // already done

    console.log('✅ Database connected successfully');

    // Create tables if they don't exist
    console.log('🔧 Creating database tables...');
    await User.createTable();
    await Friend.createTable();
    await Deadline.createTable();
    await DeadlineCollaborator.createTable();
    await InAppNotification.createTable();
    console.log('✅ Database tables created successfully');

    // Initialize email service
    console.log('📧 Initializing email service...');
    await emailService.verifyConnection();

    // Start notification service
    console.log('🔔 Starting notification service...');
    notificationService.start();

    dbInitialized = true;

  } catch (err) {
    // Don't exit the process — keep retrying
    console.error('❌ Database initialization attempt failed:', err && err.message ? err.message : err);
    setTimeout(initializeDatabase, DB_RETRY_DELAY);
  }
};

// Start initial attempt (non-blocking)
initializeDatabase();

// Health check 
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

//  routes imp
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const deadlineRoutes = require('./routes/deadlines');
const friendRoutes = require('./routes/friends');
const notificationRoutes = require('./routes/notifications');

// API 
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/deadlines', deadlineRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/notifications', notificationRoutes);

// 404 
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 Health check: http://localhost:${PORT}/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});