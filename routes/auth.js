const express = require('express');
const { 
  register, 
  login, 
  getProfile, 
  updateProfile, 
  changePassword, 
  logout 
} = require('../controllers/userController');
const auth = require('../middleware/auth');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes (require authentication)
router.get('/profile', auth, getProfile);
router.put('/profile', auth, updateProfile);
router.put('/change-password', auth, changePassword);
router.post('/logout', auth, logout);

module.exports = router;