const express = require('express');
const { 
  getAllUsers, 
  getUserById, 
  deleteUser,
  getNotificationPreferences,
  updateNotificationPreferences,
  forgotPassword,
  resetPassword
} = require('../controllers/userController');



const auth = require('../middleware/auth');


const router = express.Router();

// Forgot password (no auth required)
// POST /api/users/forgot-password
router.post('/forgot-password', forgotPassword);

// Reset password (no auth required)
// POST /api/users/reset-password
router.post('/reset-password', resetPassword);

// All routes require authentication
// GET /api/users - Get all users
router.get('/', auth, getAllUsers);

// GET /api/users/:id - Get user by ID
router.get('/:id', auth, getUserById);

// DELETE /api/users/:id - Delete user (admin functionality)
router.delete('/:id', auth, deleteUser);

// Notification preferences routes
// GET /api/users/notifications/preferences - Get user notification preferences
router.get('/notifications/preferences', auth, getNotificationPreferences);

// PUT /api/users/notifications/preferences - Update user notification preferences
router.put('/notifications/preferences', auth, updateNotificationPreferences);

module.exports = router;