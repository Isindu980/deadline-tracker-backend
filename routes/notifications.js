const express = require('express');
const {
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
} = require('../controllers/notificationController');
const auth = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(auth);

// GET /api/notifications - Get user's notifications with filtering and pagination
router.get('/', getNotifications);

// GET /api/notifications/unread-count - Get unread notification count
router.get('/unread-count', getUnreadCount);

// PUT /api/notifications/:notificationId/read - Mark specific notification as read
router.put('/:notificationId/read', markAsRead);

// PUT /api/notifications/mark-all-read - Mark all notifications as read
router.put('/mark-all-read', markAllAsRead);

// DELETE /api/notifications/:notificationId - Delete specific notification
router.delete('/:notificationId', deleteNotification);

// DELETE /api/notifications/read - Delete all read notifications
router.delete('/read', deleteAllRead);

// POST /api/notifications/test - Create test notification (for development/testing)
router.post('/test', createTestNotification);

// POST /api/notifications/check-overdue - Manually trigger overdue check (for testing)
router.post('/check-overdue', checkOverdueNotifications);

// POST /api/notifications/test-overdue-deadline - Create test overdue deadline (for testing)
router.post('/test-overdue-deadline', createTestOverdueDeadline);

// GET /api/notifications/test-db - Test database structure (for debugging)
router.get('/test-db', testDatabaseStructure);

// POST /api/notifications/test-overdue - Create test overdue notification directly (for debugging)
router.post('/test-overdue', createTestOverdueNotification);

// POST /api/notifications/trigger-daily-summary - Manually trigger daily summary (for testing)
router.post('/trigger-daily-summary', triggerDailySummary);

// POST /api/notifications/trigger-overdue-check - Manually trigger overdue check (for testing)
router.post('/trigger-overdue-check', triggerOverdueCheck);

// GET /api/notifications/test-user-preferences - Test user notification preferences (for debugging)
router.get('/test-user-preferences', testUserPreferences);

// GET /api/notifications/diagnostic - Run comprehensive diagnostic check
router.get('/diagnostic', diagnosticCheck);

// POST /api/notifications/force-overdue - Force create overdue notifications for all overdue deadlines
router.post('/force-overdue', forceOverdueNotifications);

// POST /api/notifications/initialize-db - Initialize and test notification database
router.post('/initialize-db', initializeNotificationDB);

module.exports = router;