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


// Test database connection and create tables
const initializeDatabase = async () => {
  try {
    // Test connection
    const client = await pool.connect();
    console.log('✅ Database connected successfully');
    client.release();
    
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
    
  } catch (err) {
    console.error('❌ Database initialization failed:', err.message);
    process.exit(1);
  }
};

// Init database and create tables
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