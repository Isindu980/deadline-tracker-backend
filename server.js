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

app.get('/', (req, res) => {
  // Serve a small, styled HTML welcome page for browsers
  res.send(`
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>Deadline Tracker API</title>
      <style>
        :root{--bg:#0f1724;--card:#0b1220;--accent:#16a34a;--muted:#9ca3af;--glass:rgba(255,255,255,0.03)}
        body{margin:0;font-family:Inter,ui-sans-serif,system-ui,Segoe UI,Roboto,'Helvetica Neue',Arial;background:linear-gradient(135deg,#071026 0%,#0b1220 100%);color:#e6eef8;display:flex;align-items:center;justify-content:center;height:100vh}
        .card{width:min(920px,95%);background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));border-radius:12px;padding:28px;box-shadow:0 6px 30px rgba(2,6,23,0.6);border:1px solid rgba(255,255,255,0.03)}
        .header{display:flex;align-items:center;gap:18px}
        .logo{width:64px;height:64px;border-radius:10px;background:var(--glass);display:flex;align-items:center;justify-content:center;font-size:28px}
        h1{margin:0;font-size:20px}
        p.lead{margin:6px 0 18px;color:var(--muted)}
        .grid{display:grid;grid-template-columns:1fr 280px;gap:20px}
        ul.features{list-style:none;padding:0;margin:0;display:grid;gap:8px}
        ul.features li{background:linear-gradient(90deg,rgba(255,255,255,0.02),transparent);padding:10px;border-radius:8px;color:#dff7e6}
        .side{background:rgba(255,255,255,0.02);padding:14px;border-radius:8px;border:1px solid rgba(255,255,255,0.02)}
        a.btn{display:inline-block;padding:8px 12px;border-radius:8px;background:var(--accent);color:#012018;text-decoration:none;font-weight:600;margin-top:10px}
        .muted{color:var(--muted);font-size:13px}
        footer{margin-top:18px;color:var(--muted);font-size:13px}
        @media (max-width:760px){.grid{grid-template-columns:1fr}}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="logo">📅</div>
          <div>
            <h1>Deadline Tracker API <span style="font-size:12px;color:var(--muted);">(HTTP API)</span></h1>
            <p class="lead">Lightweight deadline & reminders backend. Use the endpoints below to integrate with your frontend.</p>
          </div>
        </div>

        <div class="grid" style="margin-top:18px">
          <div>
            <h3 style="margin:0 0 8px 0">Features</h3>
            <ul class="features">
              <li>📅 Smart deadline management</li>
              <li>⏰ Real-time reminders & notification scheduling</li>
              <li>� Team collaboration & private copies</li>
              <li>� In-app and email notifications</li>
              <li>🔐 Authentication (JWT)</li>
            </ul>

            <h3 style="margin:18px 0 8px 0">Quickstart</h3>
            <div class="muted">Try these endpoints with curl / Postman / your frontend:</div>
            <pre style="background:transparent;padding:8px;border-radius:6px;margin-top:8px;color:#cde;">GET /api/deadlines
POST /api/auth/register
POST /api/auth/login</pre>
            <div style="margin-top:8px">
              <a class="btn" href="/api/deadlines">Browse API</a>
              <a class="btn" style="margin-left:8px;background:#0ea5e9;color:#012" href="/health">Health</a>
            </div>
          </div>

          <aside class="side">
            <h4 style="margin:0 0 8px 0">Links</h4>
            <div style="margin-top:12px" class="muted">Useful</div>
            <div style="margin-top:8px"><a href="/api/deadlines" style="color:#bfefff">/api/deadlines</a></div>
            <div style="margin-top:6px"><a href="/api/notifications" style="color:#bfefff">/api/notifications</a></div>
            <footer>
              <div style="margin-top:12px">Environment: <strong>${process.env.NODE_ENV || 'development'}</strong></div>
              <div style="margin-top:6px">Port: <strong>${process.env.PORT || 5000}</strong></div>
            </footer>
          </aside>
        </div>
      </div>
    </body>
    </html>
  `);
});

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