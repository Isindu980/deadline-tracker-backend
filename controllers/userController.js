
const crypto = require('crypto');
const emailService = require('../services/emailService');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Friend = require('../models/Friend');

// Validation helper functions
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  // At least 6 characters, 1 uppercase, 1 lowercase, 1 number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
  return passwordRegex.test(password);
};

const validateUsername = (username) => {
  // 3-30 characters, alphanumeric and underscore only
  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
  return usernameRegex.test(username);
};

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  });
};

// Register new user
const register = async (req, res) => {
  try {
    const { username, email, password, full_name } = req.body;

    // Validation
    const errors = [];

    if (!username || !validateUsername(username)) {
      errors.push('Username must be 3-30 characters and contain only letters, numbers, and underscores');
    }

    if (!email || !validateEmail(email)) {
      errors.push('Please provide a valid email address');
    }

    if (!password || !validatePassword(password)) {
      errors.push('Password must be at least 6 characters with 1 uppercase, 1 lowercase, and 1 number');
    }

    if (!full_name || full_name.trim().length < 1 || full_name.length > 100) {
      errors.push('Full name is required and must be less than 100 characters');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Check if user already exists
    const [existingEmail, existingUsername] = await Promise.all([
      User.emailExists(email),
      User.usernameExists(username)
    ]);

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: 'Username is already taken'
      });
    }

    // Create new user
    const newUser = await User.create({
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password,
      full_name: full_name.trim()
    });

    // Generate token
    const token = generateToken(newUser.id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: newUser,
        token
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    const errors = [];

    if (!email || !validateEmail(email)) {
      errors.push('Please provide a valid email address');
    }

    if (!password) {
      errors.push('Password is required');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Find user by email
    const user = await User.findByEmail(email.toLowerCase().trim());

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isValidPassword = await User.verifyPassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate token
    const token = generateToken(user.id);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userWithoutPassword,
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        user
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { username, email, full_name } = req.body;

    // Validation
    const errors = [];

    if (username && !validateUsername(username)) {
      errors.push('Username must be 3-30 characters and contain only letters, numbers, and underscores');
    }

    if (email && !validateEmail(email)) {
      errors.push('Please provide a valid email address');
    }

    if (full_name && (full_name.trim().length < 1 || full_name.length > 100)) {
      errors.push('Full name must be between 1 and 100 characters');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Check if username or email is already taken by another user
    if (username) {
      const existingUsername = await User.usernameExists(username, userId);
      if (existingUsername) {
        return res.status(400).json({
          success: false,
          message: 'Username is already taken'
        });
      }
    }

    if (email) {
      const existingEmail = await User.emailExists(email.toLowerCase().trim(), userId);
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: 'Email is already taken'
        });
      }
    }

    // Get current user data for fallback values
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user with provided data or keep existing values
    const updatedUser = await User.update(userId, {
      username: username ? username.trim() : currentUser.username,
      email: email ? email.toLowerCase().trim() : currentUser.email,
      full_name: full_name ? full_name.trim() : currentUser.full_name,
      role: currentUser.role // Keep existing role
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: updatedUser
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;

    // Validation
    const errors = [];

    if (!currentPassword) {
      errors.push('Current password is required');
    }

    if (!newPassword || !validatePassword(newPassword)) {
      errors.push('New password must be at least 6 characters with 1 uppercase, 1 lowercase, and 1 number');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Get current user with password
    const user = await User.findByEmail(req.user.email);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isValidPassword = await User.verifyPassword(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    await User.updatePassword(userId, newPassword);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};


const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    const user = await User.findByEmail(email.toLowerCase().trim());
    if (!user) {
      // Respond generically to avoid user enumeration
      return res.json({
        success: true,
        message: 'If an account with that email exists, a reset link has been sent.'
      });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry

    // Store token and expiry in user record (assumes User model has setResetToken)
    await User.setResetToken(user.id, token, expires);

    // Send email with reset link
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await emailService.sendPasswordReset(user.email, user.full_name, resetUrl);

    return res.json({
      success: true,
      message: 'If an account with that email exists, a reset link has been sent.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Reset password
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || !validatePassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Token and valid new password are required'
      });
    }

    // Find user by token
    const user = await User.findByResetToken(token);
    if (!user || !user.reset_token_expires || new Date(user.reset_token_expires) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Update password and clear reset token
    await User.updatePassword(user.id, newPassword);
    await User.clearResetToken(user.id);

    return res.json({
      success: true,
      message: 'Password has been reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get all users (admin functionality)
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const offset = (page - 1) * limit;

    let users;
    if (search) {
      // If search is provided, we'd need to add a search method to User model
      // For now, get all users and filter client-side (not ideal for large datasets)
      const allUsers = await User.findAll(1000, 0);
      users = allUsers.filter(user => 
        user.username.toLowerCase().includes(search.toLowerCase()) ||
        user.email.toLowerCase().includes(search.toLowerCase()) ||
        user.full_name.toLowerCase().includes(search.toLowerCase())
      ).slice(offset, offset + parseInt(limit));
    } else {
      users = await User.findAll(parseInt(limit), offset);
    }

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid user ID is required'
      });
    }

    const user = await User.findById(parseInt(id));

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        user
      }
    });

  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete user (admin functionality)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid user ID is required'
      });
    }

    // Check if user exists
    const user = await User.findById(parseInt(id));
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent users from deleting themselves
    if (parseInt(id) === req.user.userId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    // Delete user
    await User.delete(parseInt(id));

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Logout (for token blacklisting if implemented)
const logout = async (req, res) => {
  try {
    // In a stateless JWT implementation, logout is handled client-side
    // by removing the token. This endpoint can be used for token blacklisting
    // if that feature is implemented later
    
    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Friend Management Functions

// Send friend request
const sendFriendRequest = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { friend_id } = req.body;

    // Enhanced validation
    if (!friend_id) {
      return res.status(400).json({
        success: false,
        message: 'Friend ID is required'
      });
    }

    // Convert to integer and validate
    const friendId = parseInt(friend_id);
    if (isNaN(friendId) || friendId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid friend ID format'
      });
    }

    if (userId === friendId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot send a friend request to yourself'
      });
    }

    // Check if the friend user exists
    const friendUser = await User.findById(friendId);
    if (!friendUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Send friend request
    const friendship = await Friend.sendFriendRequest(userId, friendId);

    res.status(201).json({
      success: true,
      message: 'Friend request sent successfully',
      data: {
        friendship_id: friendship.id,
        friend: {
          id: friendUser.id,
          username: friendUser.username,
          full_name: friendUser.full_name,
          email: friendUser.email
        },
        requested_at: friendship.created_at
      }
    });

  } catch (error) {
    console.error('Send friend request error:', error);
    
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: 'Friend request already exists or users are already friends'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Accept friend request
const acceptFriendRequest = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { friend_id } = req.body;

    // Enhanced validation
    if (!friend_id) {
      return res.status(400).json({
        success: false,
        message: 'Friend ID is required'
      });
    }

    // Convert to integer and validate
    const friendId = parseInt(friend_id);
    if (isNaN(friendId) || friendId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid friend ID format'
      });
    }

    if (userId === friendId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid operation'
      });
    }

    // Accept friend request
    const friendships = await Friend.acceptFriendRequest(userId, friendId);

    if (!friendships || friendships.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found or already processed'
      });
    }

    // Get friend details
    const friendUser = await User.findById(friendId);
    if (!friendUser) {
      return res.status(404).json({
        success: false,
        message: 'Friend user not found'
      });
    }

    res.json({
      success: true,
      message: 'Friend request accepted successfully',
      data: {
        friendship_id: friendships[0].id,
        friend: {
          id: friendUser.id,
          username: friendUser.username,
          full_name: friendUser.full_name,
          email: friendUser.email
        },
        accepted_at: friendships[0].updated_at
      }
    });

  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Decline friend request
const declineFriendRequest = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { friend_id } = req.body;

    // Enhanced validation
    if (!friend_id) {
      return res.status(400).json({
        success: false,
        message: 'Friend ID is required'
      });
    }

    // Convert to integer and validate
    const friendId = parseInt(friend_id);
    if (isNaN(friendId) || friendId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid friend ID format'
      });
    }

    if (userId === friendId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid operation'
      });
    }

    // Decline friend request
    const friendships = await Friend.declineFriendRequest(userId, friendId);

    if (!friendships || friendships.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found or already processed'
      });
    }

    res.json({
      success: true,
      message: 'Friend request declined successfully',
      data: {
        declined_at: friendships[0].updated_at
      }
    });

  } catch (error) {
    console.error('Decline friend request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Remove friend or cancel request
const removeFriend = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { friend_id } = req.params;

    // Enhanced validation
    if (!friend_id) {
      return res.status(400).json({
        success: false,
        message: 'Friend ID is required'
      });
    }

    // Convert to integer and validate
    const friendId = parseInt(friend_id);
    if (isNaN(friendId) || friendId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid friend ID format'
      });
    }

    if (userId === friendId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot remove yourself'
      });
    }

    // Check if friendship exists
    const friendshipStatus = await Friend.getFriendshipStatus(userId, friendId);
    if (!friendshipStatus) {
      return res.status(404).json({
        success: false,
        message: 'Friendship not found'
      });
    }

    // Remove friend
    const friendships = await Friend.removeFriend(userId, friendId);

    if (!friendships || friendships.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Friendship not found or already removed'
      });
    }

    const actionMessage = friendshipStatus.status === 'accepted' 
      ? 'Friend removed successfully'
      : 'Friend request cancelled successfully';

    res.json({
      success: true,
      message: actionMessage,
      data: {
        removed_at: new Date().toISOString(),
        previous_status: friendshipStatus.status
      }
    });

  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Block user
const blockUser = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { friend_id } = req.body;

    // Enhanced validation
    if (!friend_id) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Convert to integer and validate
    const friendId = parseInt(friend_id);
    if (isNaN(friendId) || friendId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    if (userId === friendId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot block yourself'
      });
    }

    // Check if the user exists
    const userToBlock = await User.findById(friendId);
    if (!userToBlock) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Block user
    const blocked = await Friend.blockUser(userId, friendId);

    res.json({
      success: true,
      message: 'User blocked successfully',
      data: {
        blocked_user: {
          id: userToBlock.id,
          username: userToBlock.username,
          full_name: userToBlock.full_name
        },
        blocked_at: blocked.created_at || new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Block user error:', error);
    
    if (error.message.includes('already blocked')) {
      return res.status(409).json({
        success: false,
        message: 'User is already blocked'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Unblock user
const unblockUser = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { friend_id } = req.body;

    // Enhanced validation
    if (!friend_id) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Convert to integer and validate
    const friendId = parseInt(friend_id);
    if (isNaN(friendId) || friendId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    if (userId === friendId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot unblock yourself'
      });
    }

    // Check if the user exists
    const userToUnblock = await User.findById(friendId);
    if (!userToUnblock) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is actually blocked
    const friendshipStatus = await Friend.getFriendshipStatus(userId, friendId);
    if (!friendshipStatus || friendshipStatus.status !== 'blocked') {
      return res.status(404).json({
        success: false,
        message: 'User is not blocked'
      });
    }

    // Unblock user
    const unblocked = await Friend.unblockUser(userId, friendId);

    if (!unblocked) {
      return res.status(404).json({
        success: false,
        message: 'Block relationship not found'
      });
    }

    res.json({
      success: true,
      message: 'User unblocked successfully',
      data: {
        unblocked_user: {
          id: userToUnblock.id,
          username: userToUnblock.username,
          full_name: userToUnblock.full_name
        },
        unblocked_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get friends list
const getFriends = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status = 'accepted', page = 1, limit = 50 } = req.query;

    // Validate status parameter
    const validStatuses = ['accepted', 'pending', 'declined', 'blocked'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Validate pagination parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Page must be a positive integer'
      });
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: 'Limit must be between 1 and 100'
      });
    }

    const friends = await Friend.getFriends(userId, status);

    // Apply pagination
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedFriends = friends.slice(startIndex, endIndex);

    res.json({
      success: true,
      message: 'Friends retrieved successfully',
      data: {
        friends: paginatedFriends,
        pagination: {
          current_page: pageNum,
          per_page: limitNum,
          total_items: friends.length,
          total_pages: Math.ceil(friends.length / limitNum)
        },
        filter: {
          status: status
        }
      }
    });

  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get pending friend requests
const getPendingRequests = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 20 } = req.query;

    // Validate pagination parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Page must be a positive integer'
      });
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
      return res.status(400).json({
        success: false,
        message: 'Limit must be between 1 and 50'
      });
    }

    const pendingRequests = await Friend.getPendingRequests(userId);

    // Apply pagination
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedRequests = pendingRequests.slice(startIndex, endIndex);

    res.json({
      success: true,
      message: 'Pending requests retrieved successfully',
      data: {
        pending_requests: paginatedRequests.map(request => ({
          request_id: request.request_id,
          user_id: request.user_id,
          username: request.username,
          full_name: request.full_name,
          email: request.email,
          requested_at: request.requested_at,
          user_created: request.user_created
        })),
        pagination: {
          current_page: pageNum,
          per_page: limitNum,
          total_items: pendingRequests.length,
          total_pages: Math.ceil(pendingRequests.length / limitNum)
        }
      }
    });

  } catch (error) {
    console.error('Get pending requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get sent friend requests
const getSentRequests = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 20 } = req.query;

    // Validate pagination parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Page must be a positive integer'
      });
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
      return res.status(400).json({
        success: false,
        message: 'Limit must be between 1 and 50'
      });
    }

    const sentRequests = await Friend.getSentRequests(userId);

    // Apply pagination
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedRequests = sentRequests.slice(startIndex, endIndex);

    res.json({
      success: true,
      message: 'Sent requests retrieved successfully',
      data: {
        sent_requests: paginatedRequests.map(request => ({
          request_id: request.request_id,
          user_id: request.user_id,
          username: request.username,
          full_name: request.full_name,
          email: request.email,
          requested_at: request.requested_at,
          user_created: request.user_created
        })),
        pagination: {
          current_page: pageNum,
          per_page: limitNum,
          total_items: sentRequests.length,
          total_pages: Math.ceil(sentRequests.length / limitNum)
        }
      }
    });

  } catch (error) {
    console.error('Get sent requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Search users
const searchUsers = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { search, limit = 10 } = req.query;

    // Enhanced validation
    if (!search) {
      return res.status(400).json({
        success: false,
        message: 'Search term is required'
      });
    }

    const trimmedSearch = search.trim();
    if (trimmedSearch.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search term must be at least 2 characters long'
      });
    }

    if (trimmedSearch.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Search term cannot exceed 50 characters'
      });
    }

    // Validate limit parameter
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
      return res.status(400).json({
        success: false,
        message: 'Limit must be between 1 and 50'
      });
    }

    const users = await Friend.searchUsers(userId, trimmedSearch, limitNum);

    res.json({
      success: true,
      message: 'Users found successfully',
      data: {
        users: users.map(user => ({
          id: user.id,
          username: user.username,
          full_name: user.full_name,
          email: user.email,
          created_at: user.created_at,
          relationship_status: user.relationship_status || 'none'
        })),
        search_term: trimmedSearch,
        count: users.length,
        limit: limitNum
      }
    });

  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get friend statistics
const getFriendStats = async (req, res) => {
  try {
    const userId = req.user.userId;

    const stats = await Friend.getFriendStats(userId);

    // Ensure all values are properly formatted as integers
    const formattedStats = {
      total_friends: parseInt(stats.total_friends) || 0,
      pending_requests: parseInt(stats.pending_requests) || 0,
      sent_requests: parseInt(stats.sent_requests) || 0,
      blocked_users: parseInt(stats.blocked_users) || 0
    };

    // Calculate additional metrics
    const totalConnections = formattedStats.total_friends + 
                           formattedStats.pending_requests + 
                           formattedStats.sent_requests;

    res.json({
      success: true,
      message: 'Friend statistics retrieved successfully',
      data: {
        stats: formattedStats,
        summary: {
          total_connections: totalConnections,
          has_pending_activity: (formattedStats.pending_requests + formattedStats.sent_requests) > 0
        },
        last_updated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Get friend stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get user notification preferences
const getNotificationPreferences = async (req, res) => {
  try {
    const userId = req.user.userId;

    const preferences = await User.getNotificationPreferences(userId);

    res.json({
      success: true,
      message: 'Notification preferences retrieved successfully',
      data: {
        preferences
      }
    });

  } catch (error) {
    console.error('Get notification preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update user notification preferences
const updateNotificationPreferences = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { 
      email_enabled, 
      reminders, 
      overdue_notifications, 
      daily_summary,
      in_app_enabled,
      in_app_reminders,
      in_app_overdue_notifications,
      in_app_daily_summary
    } = req.body;

    // Validation
    const errors = [];

    if (email_enabled !== undefined && typeof email_enabled !== 'boolean') {
      errors.push('email_enabled must be a boolean');
    }

    if (reminders !== undefined) {
      if (typeof reminders !== 'object' || reminders === null) {
        errors.push('reminders must be an object');
      } else {
        const validReminderTypes = ['2_days', '1_day', '12_hours', '1_hour'];
        for (const [key, value] of Object.entries(reminders)) {
          if (!validReminderTypes.includes(key)) {
            errors.push(`Invalid reminder type: ${key}`);
          }
          if (typeof value !== 'boolean') {
            errors.push(`Reminder ${key} must be a boolean`);
          }
        }
      }
    }

    if (overdue_notifications !== undefined && typeof overdue_notifications !== 'boolean') {
      errors.push('overdue_notifications must be a boolean');
    }

    if (daily_summary !== undefined && typeof daily_summary !== 'boolean') {
      errors.push('daily_summary must be a boolean');
    }

    // In-app notification validations
    if (in_app_enabled !== undefined && typeof in_app_enabled !== 'boolean') {
      errors.push('in_app_enabled must be a boolean');
    }

    if (in_app_reminders !== undefined) {
      if (typeof in_app_reminders !== 'object' || in_app_reminders === null) {
        errors.push('in_app_reminders must be an object');
      } else {
        const validReminderTypes = ['2_days', '1_day', '12_hours', '1_hour'];
        for (const [key, value] of Object.entries(in_app_reminders)) {
          if (!validReminderTypes.includes(key)) {
            errors.push(`Invalid in-app reminder type: ${key}`);
          }
          if (typeof value !== 'boolean') {
            errors.push(`In-app reminder ${key} must be a boolean`);
          }
        }
      }
    }

    if (in_app_overdue_notifications !== undefined && typeof in_app_overdue_notifications !== 'boolean') {
      errors.push('in_app_overdue_notifications must be a boolean');
    }

    if (in_app_daily_summary !== undefined && typeof in_app_daily_summary !== 'boolean') {
      errors.push('in_app_daily_summary must be a boolean');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Get current preferences
    const currentPreferences = await User.getNotificationPreferences(userId);

    // Merge with new preferences
    const updatedPreferences = {
      email_enabled: email_enabled !== undefined ? email_enabled : currentPreferences.email_enabled,
      reminders: reminders ? { ...currentPreferences.reminders, ...reminders } : currentPreferences.reminders,
      overdue_notifications: overdue_notifications !== undefined ? overdue_notifications : currentPreferences.overdue_notifications,
      daily_summary: daily_summary !== undefined ? daily_summary : currentPreferences.daily_summary,
      in_app_enabled: in_app_enabled !== undefined ? in_app_enabled : currentPreferences.in_app_enabled,
      in_app_reminders: in_app_reminders ? { ...currentPreferences.in_app_reminders, ...in_app_reminders } : currentPreferences.in_app_reminders,
      in_app_overdue_notifications: in_app_overdue_notifications !== undefined ? in_app_overdue_notifications : currentPreferences.in_app_overdue_notifications,
      in_app_daily_summary: in_app_daily_summary !== undefined ? in_app_daily_summary : currentPreferences.in_app_daily_summary
    };

    const preferences = await User.updateNotificationPreferences(userId, updatedPreferences);

    res.json({
      success: true,
      message: 'Notification preferences updated successfully',
      data: {
        preferences
      }
    });

  } catch (error) {
    console.error('Update notification preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  getAllUsers,
  getUserById,
  deleteUser,
  logout,
  // Friend management functions
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
  getFriendStats,
  // Notification preferences
  getNotificationPreferences,
  updateNotificationPreferences
  ,forgotPassword
  ,resetPassword
};
