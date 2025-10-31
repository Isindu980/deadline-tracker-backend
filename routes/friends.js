const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { 
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  blockUser,
  unblockUser,
  getFriends,
  getPendingRequests,
  getSentRequests,
  searchUsers,
  getFriendStats
} = require('../controllers/userController');

// All routes require authentication
router.use(auth);

// Friend request management
router.post('/request', sendFriendRequest);           // Send friend request
router.put('/accept', acceptFriendRequest);           // Accept friend request
router.put('/decline', declineFriendRequest);         // Decline friend request
router.delete('/:friend_id', removeFriend);           // Remove friend or cancel request
router.post('/block', blockUser);                     // Block user
router.post('/unblock', unblockUser);                 // Unblock user

// Friend lists and search
router.get('/', getFriends);                          // Get friends list
router.get('/pending', getPendingRequests);           // Get pending requests (incoming)
router.get('/sent', getSentRequests);                 // Get sent requests (outgoing)
router.get('/search', searchUsers);                   // Search for users to add
router.get('/stats', getFriendStats);                 // Get friend statistics

module.exports = router;