const InAppNotification = require('../models/InAppNotification');

// Get user's notifications
const getNotifications = async (req, res) => {
  try {
    console.log('📱 Getting notifications for user:', req.user.userId);
    console.log('Query parameters:', req.query);

    const userId = req.user.userId;
    const { 
      is_read, 
      type, 
      priority, 
      page = 1, 
      limit = 20, 
      order_by = 'created_at', 
      order_direction = 'DESC' 
    } = req.query;

    // Validation
    const errors = [];

    if (page && (isNaN(parseInt(page)) || parseInt(page) < 1)) {
      errors.push('Page must be a positive integer');
    }

    if (limit && (isNaN(parseInt(limit)) || parseInt(limit) < 1 || parseInt(limit) > 100)) {
      errors.push('Limit must be between 1 and 100');
    }

    if (is_read !== undefined && !['true', 'false'].includes(is_read)) {
      errors.push('is_read must be true or false');
    }

    const validTypes = ['reminder', 'overdue', 'deadline_shared', 'deadline_updated'];
    if (type && !validTypes.includes(type)) {
      errors.push(`type must be one of: ${validTypes.join(', ')}`);
    }

    const validPriorities = ['low', 'normal', 'high', 'urgent'];
    if (priority && !validPriorities.includes(priority)) {
      errors.push(`priority must be one of: ${validPriorities.join(', ')}`);
    }

    const validOrderFields = ['created_at', 'updated_at', 'priority', 'is_read'];
    if (order_by && !validOrderFields.includes(order_by)) {
      errors.push(`order_by must be one of: ${validOrderFields.join(', ')}`);
    }

    const validDirections = ['ASC', 'DESC'];
    if (order_direction && !validDirections.includes(order_direction.toUpperCase())) {
      errors.push('order_direction must be ASC or DESC');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const options = {
      is_read: is_read !== undefined ? is_read === 'true' : undefined,
      type,
      priority,
      limit: parseInt(limit),
      offset,
      order_by,
      order_direction: order_direction.toUpperCase()
    };

    const notifications = await InAppNotification.getUserNotifications(userId, options);

    console.log('📬 Retrieved notifications:', notifications.length, 'notifications');
    console.log('Sample notifications:', notifications.slice(0, 2));

    res.json({
      success: true,
      message: 'Notifications retrieved successfully',
      data: {
        notifications,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total_items: notifications.length
        }
      }
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get unread notification count
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.userId;

    const unreadCount = await InAppNotification.getUnreadCount(userId);

    res.json({
      success: true,
      message: 'Unread count retrieved successfully',
      data: {
        unread_count: unreadCount
      }
    });

  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Mark notification as read
const markAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { notificationId } = req.params;

    if (!notificationId || isNaN(parseInt(notificationId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid notification ID is required'
      });
    }

    const notification = await InAppNotification.markAsRead(parseInt(notificationId), userId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: {
        notification
      }
    });

  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Mark all notifications as read
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await InAppNotification.markAllAsRead(userId);

    res.json({
      success: true,
      message: 'All notifications marked as read',
      data: {
        updated_count: result.updated_count
      }
    });

  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete notification
const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { notificationId } = req.params;

    if (!notificationId || isNaN(parseInt(notificationId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid notification ID is required'
      });
    }

    const deletedNotification = await InAppNotification.delete(parseInt(notificationId), userId);

    if (!deletedNotification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully',
      data: {
        deleted_id: deletedNotification.id
      }
    });

  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete all read notifications
const deleteAllRead = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await InAppNotification.deleteAllRead(userId);

    res.json({
      success: true,
      message: 'All read notifications deleted',
      data: {
        deleted_count: result.deleted_count
      }
    });

  } catch (error) {
    console.error('Delete all read error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Create test notification
const createTestNotification = async (req, res) => {
  try {
    console.log('🧪 Creating test notification...');
    console.log('User ID:', req.user.userId);
    console.log('Request body:', req.body);

    const userId = req.user.userId;
    const { title, message, type } = req.body;

    // Use provided values or defaults
    const notificationData = {
      user_id: userId,
      title: title || 'Test Notification',
      message: message || 'This is a test notification to verify the frontend is working correctly.',
      type: type || 'test',
      priority: 'normal'
    };

    console.log('📋 Notification data:', notificationData);

    const notification = await InAppNotification.create(notificationData);
    
    console.log('✅ Notification created successfully:', notification);

    res.status(201).json({
      success: true,
      message: 'Test notification created successfully',
      data: {
        notification
      }
    });

  } catch (error) {
    console.error('❌ Create test notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Manually trigger overdue notification check (for testing)
const checkOverdueNotifications = async (req, res) => {
  try {
    const notificationService = require('../services/notificationService');
    
    console.log('🔍 Manually triggering overdue notification check...');
    
    // Check if there are any deadlines that should be overdue
    const pool = require('../config/db');
    const checkQuery = `
      SELECT id, title, due_date, status 
      FROM deadlines 
      WHERE due_date < NOW() 
      AND status NOT IN ('completed', 'overdue')
      ORDER BY due_date ASC
      LIMIT 10
    `;
    
    const result = await pool.query(checkQuery);
    console.log(`📋 Found ${result.rows.length} potentially overdue deadlines:`, result.rows);
    
    // Run the overdue check
    await notificationService.checkOverdueDeadlines();
    
    // Check notifications created
    const notifQuery = `
      SELECT * FROM in_app_notifications 
      WHERE type = 'overdue' 
      ORDER BY created_at DESC 
      LIMIT 5
    `;
    
    const notifications = await pool.query(notifQuery);
    console.log(`📱 Recent overdue notifications:`, notifications.rows);
    
    res.json({
      success: true,
      message: 'Overdue notification check completed successfully',
      data: {
        potentially_overdue_deadlines: result.rows,
        recent_overdue_notifications: notifications.rows
      }
    });

  } catch (error) {
    console.error('❌ Manual overdue check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Create test overdue deadline (for testing)
const createTestOverdueDeadline = async (req, res) => {
  try {
    const userId = req.user.userId;
    const Deadline = require('../models/Deadline');
    
    // Create a deadline that's already overdue (1 hour ago)
    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - 1);
    
    const deadlineData = {
      student_id: userId,
      title: 'Test Overdue Deadline',
      description: 'This is a test deadline that is already overdue for testing notifications',
      due_date: pastDate.toISOString().slice(0, 19).replace('T', ' '),
      priority: 'high',
      status: 'pending'
    };

    const deadline = await Deadline.create(deadlineData);

    res.status(201).json({
      success: true,
      message: 'Test overdue deadline created successfully',
      data: {
        deadline,
        note: 'Run /api/notifications/check-overdue to trigger notification processing'
      }
    });

  } catch (error) {
    console.error('Create test overdue deadline error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Test database connection and table structure
const testDatabaseStructure = async (req, res) => {
  try {
    const pool = require('../config/db');
    
    console.log('🔍 Testing database structure...');
    
    // Check if in_app_notifications table exists
    const tableCheckQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'in_app_notifications'
      );
    `;
    
    const tableExists = await pool.query(tableCheckQuery);
    console.log('Table exists:', tableExists.rows[0].exists);
    
    let structure = null;
    let count = null;
    let sample = null;
    
    if (tableExists.rows[0].exists) {
      // Get table structure
      const structureQuery = `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'in_app_notifications'
        ORDER BY ordinal_position;
      `;
      
      structure = await pool.query(structureQuery);
      console.log('Table structure:', structure.rows);
      
      // Count total notifications
      const countQuery = 'SELECT COUNT(*) as total FROM in_app_notifications';
      count = await pool.query(countQuery);
      console.log('Total notifications in DB:', count.rows[0].total);
      
      // Get sample notifications
      const sampleQuery = 'SELECT * FROM in_app_notifications ORDER BY created_at DESC LIMIT 3';
      sample = await pool.query(sampleQuery);
      console.log('Sample notifications:', sample.rows);
    }
    
    res.json({
      success: true,
      message: 'Database structure check completed',
      data: {
        table_exists: tableExists.rows[0].exists,
        structure: tableExists.rows[0].exists ? structure.rows : null,
        total_notifications: tableExists.rows[0].exists ? count.rows[0].total : 0,
        sample_notifications: tableExists.rows[0].exists ? sample.rows : []
      }
    });

  } catch (error) {
    console.error('❌ Database test error:', error);
    res.status(500).json({
      success: false,
      message: 'Database test failed',
      error: error.message
    });
  }
};

// Create a test overdue notification directly (bypassing the service)
const createTestOverdueNotification = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    console.log('🧪 Creating test overdue notification for user:', userId);
    
    // Check user preferences
    const User = require('../models/User');
    const preferences = await User.getNotificationPreferences(userId);
    console.log('User notification preferences:', preferences);
    
    // Create test overdue notification data
    const testDeadline = {
      id: 999,
      title: 'Test Overdue Deadline',
      description: 'This is a test overdue deadline',
      due_date: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      priority: 'high'
    };
    
    const overdueDuration = '1 hour';
    
    // Try to create the notification directly
    const notificationData = {
      user_id: userId,
      deadline_id: testDeadline.id,
      type: 'overdue',
      title: `Overdue: ${testDeadline.title}`,
      message: `Your deadline "${testDeadline.title}" is overdue by ${overdueDuration}. Please complete it as soon as possible.`,
      data: {
        deadline_id: testDeadline.id,
        overdue_duration: overdueDuration,
        original_due_date: testDeadline.due_date.toISOString()
      },
      priority: 'high'
    };
    
    console.log('📋 Creating notification with data:', notificationData);
    
    const notification = await InAppNotification.create(notificationData);
    
    console.log('✅ Test overdue notification created:', notification);
    
    res.status(201).json({
      success: true,
      message: 'Test overdue notification created successfully',
      data: {
        notification,
        user_preferences: preferences,
        test_deadline: testDeadline
      }
    });

  } catch (error) {
    console.error('❌ Create test overdue notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create test overdue notification',
      error: error.message
    });
  }
};

// Manually trigger daily summary for testing
const triggerDailySummary = async (req, res) => {
  try {
    console.log('📊 Manual daily summary trigger started...');
    
    const notificationService = require('../services/notificationService');
    await notificationService.sendDailySummary();

    res.json({
      success: true,
      message: 'Daily summary triggered successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Trigger daily summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger daily summary',
      error: error.message
    });
  }
};

// Manually trigger overdue deadline check for testing
const triggerOverdueCheck = async (req, res) => {
  try {
    console.log('🚨 Manual overdue check trigger started...');
    
    const pool = require('../config/db');
    const InAppNotification = require('../models/InAppNotification');
    const User = require('../models/User');
    const DeadlineCollaborator = require('../models/DeadlineCollaborator');
    
    // First, let's see what overdue deadlines exist
    const overdueQuery = `
      SELECT d.*, 
             EXTRACT(EPOCH FROM (NOW() - d.due_date))/3600 as hours_overdue
      FROM deadlines d
      WHERE d.due_date < NOW()
      AND d.status != 'completed'
      ORDER BY d.due_date ASC
    `;
    
    const overdueResult = await pool.query(overdueQuery);
    const overdueDeadlines = overdueResult.rows;
    
    console.log(`🔍 Found ${overdueDeadlines.length} overdue deadlines in database`);
    
    const debugInfo = {
      total_overdue_found: overdueDeadlines.length,
      deadlines: [],
      notifications_created: 0,
      errors: []
    };

    for (const deadline of overdueDeadlines.slice(0, 6)) { // Limit to 6 for debugging
      try {
        const deadlineInfo = {
          id: deadline.id,
          title: deadline.title,
          due_date: deadline.due_date,
          status: deadline.status,
          hours_overdue: Math.round(deadline.hours_overdue * 100) / 100,
          collaborators: [],
          notifications_created: 0
        };

        // Get collaborators for this deadline
        const recipients = await DeadlineCollaborator.getNotificationRecipients(deadline.id);
        console.log(`📋 Deadline "${deadline.title}" has ${recipients.length} collaborators`);

        for (const recipient of recipients) {
          try {
            // Check if user has in-app overdue notifications enabled
            const hasInAppOverdueEnabled = await User.hasInAppOverdueNotificationsEnabled(recipient.user_id);
            
            const collaboratorInfo = {
              user_id: recipient.user_id,
              email: recipient.email,
              role: recipient.role,
              in_app_enabled: hasInAppOverdueEnabled,
              notification_created: false,
              error: null
            };

            if (hasInAppOverdueEnabled) {
              // Calculate overdue duration
              const now = new Date();
              const due = new Date(deadline.due_date);
              const diffMs = now - due;
              const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
              
              let overdueDuration;
              if (days > 0) {
                overdueDuration = `${days} day${days > 1 ? 's' : ''} and ${hours} hour${hours > 1 ? 's' : ''}`;
              } else {
                overdueDuration = `${hours} hour${hours > 1 ? 's' : ''}`;
              }

              // Create the notification
              const notification = await InAppNotification.createOverdueNotification(
                recipient.user_id, 
                deadline, 
                overdueDuration
              );
              
              collaboratorInfo.notification_created = true;
              collaboratorInfo.notification_id = notification.id;
              deadlineInfo.notifications_created++;
              debugInfo.notifications_created++;
              
              console.log(`✅ Created overdue notification for user ${recipient.user_id} (${recipient.email})`);
            } else {
              console.log(`🔕 In-app overdue notifications disabled for user ${recipient.user_id} (${recipient.email})`);
            }

            deadlineInfo.collaborators.push(collaboratorInfo);

          } catch (error) {
            console.error(`❌ Error processing recipient ${recipient.user_id}:`, error);
            debugInfo.errors.push({
              deadline_id: deadline.id,
              user_id: recipient.user_id,
              error: error.message
            });
          }
        }

        debugInfo.deadlines.push(deadlineInfo);
        
      } catch (error) {
        console.error(`❌ Error processing deadline ${deadline.id}:`, error);
        debugInfo.errors.push({
          deadline_id: deadline.id,
          error: error.message
        });
      }
    }

    console.log('🚨 Overdue check completed');
    console.log(`📊 Summary: ${debugInfo.notifications_created} notifications created, ${debugInfo.errors.length} errors`);

    res.json({
      success: true,
      message: 'Overdue deadline check completed with detailed debugging',
      debug_info: debugInfo,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Trigger overdue check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger overdue check',
      error: error.message
    });
  }
};

// Test user notification preferences
const testUserPreferences = async (req, res) => {
  try {
    const userId = req.user.userId;
    const User = require('../models/User');
    
    console.log(`🔍 Testing notification preferences for user ${userId}...`);
    
    const preferences = await User.getNotificationPreferences(userId);
    const hasInAppOverdueEnabled = await User.hasInAppOverdueNotificationsEnabled(userId);
    const hasEmailOverdueEnabled = await User.hasOverdueNotificationsEnabled(userId);
    const hasInAppEnabled = await User.hasInAppNotificationsEnabled(userId);

    const testResults = {
      user_id: userId,
      raw_preferences: preferences,
      tests: {
        has_in_app_enabled: hasInAppEnabled,
        has_in_app_overdue_enabled: hasInAppOverdueEnabled,
        has_email_overdue_enabled: hasEmailOverdueEnabled
      }
    };

    console.log('📋 User preferences test results:', testResults);

    res.json({
      success: true,
      message: 'User notification preferences tested successfully',
      data: testResults
    });

  } catch (error) {
    console.error('❌ Test user preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test user preferences',
      error: error.message
    });
  }
};

// Comprehensive diagnostic for notification system
const diagnosticCheck = async (req, res) => {
  try {
    const pool = require('../config/db');
    const User = require('../models/User');
    const InAppNotification = require('../models/InAppNotification');
    
    console.log('🔍 Running comprehensive notification diagnostic...');
    
    const diagnostic = {
      step1_database: {},
      step2_deadlines: {},
      step3_user_prefs: {},
      step4_test_notification: {},
      errors: []
    };

    // Step 1: Check database tables
    try {
      const tablesCheck = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('users', 'deadlines', 'deadline_collaborators', 'in_app_notifications')
      `);
      
      diagnostic.step1_database.existing_tables = tablesCheck.rows.map(r => r.table_name);
      
      // Get record counts
      for (const table of diagnostic.step1_database.existing_tables) {
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        diagnostic.step1_database[`${table}_count`] = parseInt(countResult.rows[0].count);
      }
    } catch (error) {
      diagnostic.errors.push(`Database check error: ${error.message}`);
    }

    // Step 2: Check overdue deadlines
    try {
      const overdueQuery = `
        SELECT d.id, d.title, d.due_date, d.status,
               EXTRACT(EPOCH FROM (NOW() - d.due_date))/3600 as hours_overdue
        FROM deadlines d
        WHERE d.due_date < NOW()
        AND d.status != 'completed'
        ORDER BY d.due_date
        LIMIT 5
      `;
      
      const overdueResult = await pool.query(overdueQuery);
      diagnostic.step2_deadlines.overdue_count = overdueResult.rows.length;
      diagnostic.step2_deadlines.sample_overdue = overdueResult.rows;

      // Check collaborators for first overdue deadline
      if (overdueResult.rows.length > 0) {
        const firstDeadlineId = overdueResult.rows[0].id;
        const collaboratorsQuery = `
          SELECT dc.user_id, dc.role, u.email, u.username
          FROM deadline_collaborators dc
          JOIN users u ON dc.user_id = u.id
          WHERE dc.deadline_id = $1
        `;
        
        const collaboratorsResult = await pool.query(collaboratorsQuery, [firstDeadlineId]);
        diagnostic.step2_deadlines.sample_collaborators = collaboratorsResult.rows;
      }
    } catch (error) {
      diagnostic.errors.push(`Deadlines check error: ${error.message}`);
    }

    // Step 3: Check user preferences
    try {
      const userId = req.user.userId;
      const preferences = await User.getNotificationPreferences(userId);
      const hasInAppEnabled = await User.hasInAppNotificationsEnabled(userId);
      const hasInAppOverdueEnabled = await User.hasInAppOverdueNotificationsEnabled(userId);
      
      diagnostic.step3_user_prefs = {
        user_id: userId,
        raw_preferences: preferences,
        in_app_enabled: hasInAppEnabled,
        in_app_overdue_enabled: hasInAppOverdueEnabled
      };
    } catch (error) {
      diagnostic.errors.push(`User preferences error: ${error.message}`);
    }

    // Step 4: Try creating a test notification
    try {
      const userId = req.user.userId;
      const testNotification = await InAppNotification.create({
        user_id: userId,
        deadline_id: null,
        type: 'test',
        title: 'Test Notification',
        message: 'This is a test notification to verify the system is working',
        data: { test: true },
        priority: 'normal'
      });
      
      diagnostic.step4_test_notification = {
        success: true,
        notification_id: testNotification.id,
        created_at: testNotification.created_at
      };
      
      console.log('✅ Test notification created successfully:', testNotification.id);
    } catch (error) {
      diagnostic.step4_test_notification = {
        success: false,
        error: error.message
      };
      diagnostic.errors.push(`Test notification error: ${error.message}`);
    }

    res.json({
      success: true,
      message: 'Comprehensive diagnostic completed',
      data: diagnostic
    });

  } catch (error) {
    console.error('❌ Diagnostic check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run diagnostic check',
      error: error.message
    });
  }
};

// Force create overdue notifications for all overdue deadlines (testing/admin)
const forceOverdueNotifications = async (req, res) => {
  try {
    const pool = require('../config/db');
    const InAppNotification = require('../models/InAppNotification');
    const DeadlineCollaborator = require('../models/DeadlineCollaborator');
    const User = require('../models/User');
    
    console.log('🚨 Forcing overdue notifications for all overdue deadlines...');
    
    // Get all overdue deadlines
    const overdueQuery = `
      SELECT d.*, 
             EXTRACT(EPOCH FROM (NOW() - d.due_date))/3600 as hours_overdue
      FROM deadlines d
      WHERE d.due_date < NOW()
      AND d.status != 'completed'
      ORDER BY d.due_date ASC
    `;
    
    const overdueResult = await pool.query(overdueQuery);
    const overdueDeadlines = overdueResult.rows;
    
    console.log(`🔍 Found ${overdueDeadlines.length} overdue deadlines`);
    
    const results = {
      processed_deadlines: 0,
      notifications_created: 0,
      deadlines: [],
      errors: []
    };

    for (const deadline of overdueDeadlines) {
      try {
        results.processed_deadlines++;
        
        // Calculate overdue duration
        const now = new Date();
        const due = new Date(deadline.due_date);
        const diffMs = now - due;
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        let overdueDuration;
        if (days > 0) {
          overdueDuration = `${days} day${days > 1 ? 's' : ''} and ${hours} hour${hours > 1 ? 's' : ''}`;
        } else {
          overdueDuration = `${hours} hour${hours > 1 ? 's' : ''}`;
        }

        const deadlineInfo = {
          id: deadline.id,
          title: deadline.title,
          due_date: deadline.due_date,
          hours_overdue: Math.round(deadline.hours_overdue * 100) / 100,
          notifications_created: 0
        };

        // Get collaborators
        const recipients = await DeadlineCollaborator.getNotificationRecipients(deadline.id);
        console.log(`📋 Processing ${recipients.length} collaborators for deadline: ${deadline.title}`);

        for (const recipient of recipients) {
          try {
            // Check if user has in-app overdue notifications enabled
            const hasInAppOverdueEnabled = await User.hasInAppOverdueNotificationsEnabled(recipient.user_id);
            
            if (hasInAppOverdueEnabled) {
              // Create overdue notification
              const notification = await InAppNotification.createOverdueNotification(
                recipient.user_id, 
                deadline, 
                overdueDuration
              );
              
              deadlineInfo.notifications_created++;
              results.notifications_created++;
              
              console.log(`✅ Created overdue notification for user ${recipient.user_id} (${recipient.email}) - deadline: ${deadline.title}`);
            } else {
              console.log(`🔕 Skipped user ${recipient.user_id} - overdue notifications disabled`);
            }
          } catch (error) {
            console.error(`❌ Error creating notification for user ${recipient.user_id}:`, error);
            results.errors.push({
              deadline_id: deadline.id,
              user_id: recipient.user_id,
              error: error.message
            });
          }
        }

        results.deadlines.push(deadlineInfo);
        
      } catch (error) {
        console.error(`❌ Error processing deadline ${deadline.id}:`, error);
        results.errors.push({
          deadline_id: deadline.id,
          error: error.message
        });
      }
    }

    console.log(`✅ Force overdue notifications completed: ${results.notifications_created} notifications created`);

    res.json({
      success: true,
      message: `Forced overdue notifications completed. Created ${results.notifications_created} notifications for ${results.processed_deadlines} deadlines.`,
      data: results
    });

  } catch (error) {
    console.error('❌ Force overdue notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to force overdue notifications',
      error: error.message
    });
  }
};

// Initialize and test notification database
const initializeNotificationDB = async (req, res) => {
  try {
    const pool = require('../config/db');
    const InAppNotification = require('../models/InAppNotification');
    
    console.log('🔧 Initializing notification database...');
    
    const results = {
      steps: [],
      success: false,
      table_created: false,
      test_notification_created: false,
      final_count: 0
    };

    try {
      // Step 1: Force create the table
      results.steps.push('Creating in_app_notifications table...');
      await InAppNotification.createTable();
      results.table_created = true;
      results.steps.push('✅ Table created successfully');
      
      // Step 2: Verify table exists
      const tableCheckQuery = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'in_app_notifications'
        );
      `;
      
      const tableExists = await pool.query(tableCheckQuery);
      if (!tableExists.rows[0].exists) {
        throw new Error('Table creation failed - table does not exist');
      }
      results.steps.push('✅ Table existence verified');
      
      // Step 3: Test creating a notification directly with SQL
      const userId = req.user.userId;
      const directInsertQuery = `
        INSERT INTO in_app_notifications (
          user_id, deadline_id, type, title, message, data, priority, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *
      `;
      
      const testData = {
        user_id: userId,
        deadline_id: null,
        type: 'test',
        title: 'Direct SQL Test',
        message: 'This notification was created directly with SQL to test database operations.',
        data: JSON.stringify({ test: true, method: 'direct_sql' }),
        priority: 'normal'
      };
      
      const directResult = await pool.query(directInsertQuery, [
        testData.user_id,
        testData.deadline_id,
        testData.type,
        testData.title,
        testData.message,
        testData.data,
        testData.priority
      ]);
      
      results.steps.push('✅ Direct SQL insert successful');
      results.test_notification_created = true;
      
      // Step 4: Test using the model method
      const modelTestNotification = await InAppNotification.create({
        user_id: userId,
        deadline_id: null,
        type: 'test_model',
        title: 'Model Test Notification',
        message: 'This notification was created using the InAppNotification model to verify it works.',
        data: { test: true, method: 'model' },
        priority: 'normal'
      });
      
      results.steps.push('✅ Model create method successful');
      
      // Step 5: Get final count
      const countResult = await pool.query('SELECT COUNT(*) as count FROM in_app_notifications WHERE user_id = $1', [userId]);
      results.final_count = parseInt(countResult.rows[0].count);
      results.steps.push(`✅ Final notification count for user: ${results.final_count}`);
      
      results.success = true;
      results.steps.push('🎉 All tests passed - notification system is working!');
      
    } catch (error) {
      results.steps.push(`❌ Error: ${error.message}`);
      console.error('Initialization error:', error);
    }

    res.json({
      success: results.success,
      message: results.success ? 'Notification database initialized successfully' : 'Notification database initialization failed',
      data: results
    });

  } catch (error) {
    console.error('❌ Initialize notification DB error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize notification database',
      error: error.message
    });
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllRead,
  createTestNotification,
  checkOverdueNotifications,
  createTestOverdueDeadline,
  testDatabaseStructure,
  createTestOverdueNotification,
  triggerDailySummary,
  triggerOverdueCheck,
  testUserPreferences,
  diagnosticCheck,
  forceOverdueNotifications,
  initializeNotificationDB
};