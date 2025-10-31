const cron = require('node-cron');
const pool = require('../config/db');
const emailService = require('./emailService');
const User = require('../models/User');
const Deadline = require('../models/Deadline');
const DeadlineCollaborator = require('../models/DeadlineCollaborator');
const InAppNotification = require('../models/InAppNotification');

class NotificationService {
  constructor() {
    this.isRunning = false;
    this.scheduledTasks = [];
  }

  // Start notification service with cron jobs
  start() {
    if (this.isRunning) {
      console.log('📧 Notification service is already running');
      return;
    }

    console.log('🚀 Starting notification service...');

    // Check for notifications every hour
    const hourlyTask = cron.schedule('0 * * * *', async () => {
      console.log('🔍 Running hourly deadline notification check...');
      await this.checkAndSendNotifications();
    // Accept userIds as optional fourth argument
    try {
      let userIds = arguments[3];
      let value;
      if (userIds) {
        // Store as object: { timestamp, userIds }
        value = JSON.stringify({ timestamp: new Date().toISOString(), userIds });
      } else {
        value = new Date().toISOString();
      }
      const query = `
        UPDATE deadlines 
        SET notifications_sent = COALESCE(notifications_sent, '{}'::jsonb) || jsonb_build_object($1, $2)
        WHERE id = $3
      `;
      await pool.query(query, [notificationType, value, deadlineId]);
    } catch (error) {
      console.error(`❌ Error marking notification as sent:`, error);
    }
    });

    // Overdue deadline check every 4 minutes
    const overdueTask = cron.schedule('*/4 * * * *', async () => {
      console.log('🔍 Running overdue deadline check...');
      await this.checkOverdueDeadlines();
    });

    // Daily task to update overdue status and send daily summary (8 AM)
    const dailyTask = cron.schedule('0 8 * * *', async () => {
      console.log('🔍 Running daily deadline maintenance...');
      await this.updateOverdueDeadlines();
      await this.sendDailySummary();
    }, {
      scheduled: false
    });

    this.scheduledTasks = [hourlyTask, overdueTask, dailyTask];
    // Start all tasks
    this.scheduledTasks.forEach(task => task.start());
    this.isRunning = true;
    console.log('✅ Notification service started successfully');
    console.log('📅 Scheduled tasks:');
    console.log('  - Hourly notification check (every hour)');
    console.log('  - Overdue deadline check (every 4 minutes)');
    console.log('  - Daily maintenance (8:00 AM)');
  }

  // Stop notification service
  stop() {
    if (!this.isRunning) {
      console.log('📧 Notification service is not running');
      return;
    }

    console.log('🛑 Stopping notification service...');
    
    this.scheduledTasks.forEach(task => task.stop());
    this.scheduledTasks = [];
    this.isRunning = false;
    
    console.log('✅ Notification service stopped');
  }

  // Main function to check and send notifications
  async checkAndSendNotifications() {
    try {
      const notifications = [
        { hours: 48, type: '2_days' },    // 2 days before
        { hours: 24, type: '1_day' },     // 1 day before
        { hours: 12, type: '12_hours' },  // 12 hours before
        { hours: 1, type: '1_hour' }      // 1 hour before
      ];

      for (const notification of notifications) {
        await this.sendNotificationForTimeframe(notification.hours, notification.type);
      }
    } catch (error) {
      console.error('❌ Error in notification check:', error);
    }
  }

  // Send notifications for a specific timeframe
  async sendNotificationForTimeframe(hours, notificationType) {
    try {
      const startTime = new Date(Date.now() + (hours - 0.5) * 60 * 60 * 1000);
      const endTime = new Date(Date.now() + (hours + 0.5) * 60 * 60 * 1000);

      // Get deadlines due within the timeframe that haven't been notified
      const query = `
        SELECT DISTINCT d.*, 
               COALESCE(d.notifications_sent, '{}') as notifications_sent
        FROM deadlines d
        WHERE d.due_date BETWEEN $1 AND $2
        AND d.status NOT IN ('completed', 'overdue')
        AND NOT (COALESCE(d.notifications_sent, '{}')::jsonb ? $3)
      `;

      const result = await pool.query(query, [startTime, endTime, notificationType]);
      const deadlines = result.rows;

      console.log(`📨 Found ${deadlines.length} deadlines for ${hours}h notification`);

      for (const deadline of deadlines) {
        await this.sendDeadlineNotificationToAllCollaborators(deadline, hours, notificationType);
      }

    } catch (error) {
      console.error(`❌ Error sending ${hours}h notifications:`, error);
    }
  }

  // Send deadline notification to all collaborators
  async sendDeadlineNotificationToAllCollaborators(deadline, hours, notificationType) {
    try {
      // Get all users who should receive notifications for this deadline
      const recipients = await DeadlineCollaborator.getNotificationRecipients(deadline.id);
      
      const timeRemaining = this.formatTimeRemaining(hours);
      let successCount = 0;
      let failureCount = 0;

      for (const recipient of recipients) {
        // Check if user has email notifications enabled for this type
        const isReminderEnabled = await User.isReminderEnabled(recipient.user_id, notificationType);
        const isInAppReminderEnabled = await User.isInAppReminderEnabled(recipient.user_id, notificationType);
        
        if (!isReminderEnabled && !isInAppReminderEnabled) {
          console.log(`🔕 Skipping ${timeRemaining} notification for: ${deadline.title} to ${recipient.email} (all notifications disabled)`);
          continue;
        }

        const user = {
          email: recipient.email,
          username: recipient.username,
          full_name: recipient.full_name
        };

        let emailSuccess = false;
        let inAppSuccess = false;

        // Send email notification if enabled
        if (isReminderEnabled) {
          const emailResult = await emailService.sendDeadlineReminder(user, deadline, timeRemaining);
          if (emailResult.success) {
            emailSuccess = true;
            console.log(`✅ Sent ${timeRemaining} email notification for: ${deadline.title} to ${user.email} (${recipient.role})`);
          } else {
            console.error(`❌ Failed to send email notification for: ${deadline.title} to ${user.email}`, emailResult.error);
          }
        }

        // Send in-app notification if enabled
        if (isInAppReminderEnabled) {
          try {
            await InAppNotification.createDeadlineReminder(recipient.user_id, deadline, timeRemaining, notificationType);
            inAppSuccess = true;
            console.log(`✅ Created ${timeRemaining} in-app notification for: ${deadline.title} for user ${recipient.user_id} (${recipient.role})`);
          } catch (error) {
            console.error(`❌ Failed to create in-app notification for: ${deadline.title} for user ${recipient.user_id}`, error);
          }
        }

        if (emailSuccess || inAppSuccess) {
          successCount++;
        } else {
          failureCount++;
        }
      }

      // Mark notification as sent if at least one email was successful
      if (successCount > 0) {
        await this.markNotificationSent(deadline.id, notificationType);
        console.log(`📧 Notification summary for "${deadline.title}": ${successCount} sent, ${failureCount} failed`);
      }

    } catch (error) {
      console.error(`❌ Error sending notifications for deadline ${deadline.id}:`, error);
    }
  }

  // Send individual deadline notification
  async sendDeadlineNotification(deadline, hours, notificationType) {
    try {
      // Check if user has notifications enabled for this type
      const isReminderEnabled = await User.isReminderEnabled(deadline.student_id, notificationType);
      const isInAppReminderEnabled = await User.isInAppReminderEnabled(deadline.student_id, notificationType);
      
      if (!isReminderEnabled && !isInAppReminderEnabled) {
        console.log(`🔕 Skipping ${this.formatTimeRemaining(hours)} notification for: ${deadline.title} to ${deadline.email} (all notifications disabled)`);
        return;
      }

      const user = {
        email: deadline.email,
        username: deadline.username,
        full_name: deadline.full_name
      };

      const timeRemaining = this.formatTimeRemaining(hours);
      let emailSuccess = false;
      let inAppSuccess = false;
      
      // Send email notification if enabled
      if (isReminderEnabled) {
        const emailResult = await emailService.sendDeadlineReminder(user, deadline, timeRemaining);
        if (emailResult.success) {
          emailSuccess = true;
          console.log(`✅ Sent ${timeRemaining} email notification for: ${deadline.title} to ${user.email}`);
        } else {
          console.error(`❌ Failed to send email notification for: ${deadline.title}`, emailResult.error);
        }
      }

      // Send in-app notification if enabled
      if (isInAppReminderEnabled) {
        try {
          await InAppNotification.createDeadlineReminder(deadline.student_id, deadline, timeRemaining, notificationType);
          inAppSuccess = true;
          console.log(`✅ Created ${timeRemaining} in-app notification for: ${deadline.title} for user ${deadline.student_id}`);
        } catch (error) {
          console.error(`❌ Failed to create in-app notification for: ${deadline.title} for user ${deadline.student_id}`, error);
        }
      }

      // Mark notification as sent if at least one method was successful
      if (emailSuccess || inAppSuccess) {
        await this.markNotificationSent(deadline.id, notificationType);
      }

    } catch (error) {
      console.error(`❌ Error sending notification for deadline ${deadline.id}:`, error);
    }
  }

  // Mark notification as sent in database
  async markNotificationSent(deadlineId, notificationType) {
    try {
      const query = `
        UPDATE deadlines 
        SET notifications_sent = COALESCE(notifications_sent, '{}'::jsonb) || jsonb_build_object($1, $2)
        WHERE id = $3
      `;
      
      await pool.query(query, [notificationType, new Date().toISOString(), deadlineId]);
    } catch (error) {
      console.error(`❌ Error marking notification as sent:`, error);
    }
  }

  // Check and handle overdue deadlines
  async checkOverdueDeadlines() {
    try {
      // Get deadlines that just became overdue (due in the last 4 minutes to 4 hours)
      // This ensures we only notify for recently overdue deadlines, not old ones
      const query = `
        SELECT DISTINCT d.*
        FROM deadlines d
        WHERE d.due_date < NOW()
        AND d.due_date >= NOW() - INTERVAL '4 hours'
        AND d.status NOT IN ('completed', 'deleted')
      `;

      const result = await pool.query(query);
      const recentlyOverdueDeadlines = result.rows;

      console.log(`🚨 Found ${recentlyOverdueDeadlines.length} recently overdue deadlines (within last 4 hours)`);

      // Also get all overdue deadlines for status update (but won't send notifications for old ones)
      const allOverdueQuery = `
        SELECT DISTINCT d.*
        FROM deadlines d
        WHERE d.due_date < NOW()
        AND d.status NOT IN ('completed', 'deleted', 'overdue')
      `;

      const allOverdueResult = await pool.query(allOverdueQuery);
      const allOverdueDeadlines = allOverdueResult.rows;

      // Update status for all overdue deadlines
      for (const deadline of allOverdueDeadlines) {
        console.log(`📝 Updating deadline ${deadline.id} status from '${deadline.status}' to 'overdue'`);
        await this.updateDeadlineStatus(deadline.id, 'overdue');
      }

      // Send notifications only for recently overdue deadlines
      for (const deadline of recentlyOverdueDeadlines) {
        // Check if we should send overdue notification
        const shouldSendNotification = await this.shouldSendOverdueNotification(deadline.id);
        
        console.log(`🔔 Recently overdue deadline ${deadline.id} (${deadline.title}) - Should send notification: ${shouldSendNotification}`);
        
        if (shouldSendNotification) {
          console.log(`📧 Sending notification for deadline that became overdue: ${deadline.title}`);
          await this.sendOverdueNotificationToAllCollaborators(deadline);
        } else {
          console.log(`⏭️ Skipping notification for deadline ${deadline.id} - already sent recently`);
        }
      }

      console.log(`✅ Processed ${allOverdueDeadlines.length} total overdue deadlines, sent notifications for ${recentlyOverdueDeadlines.length} recently overdue ones`);

    } catch (error) {
      console.error('❌ Error checking overdue deadlines:', error);
    }
  }

  // Update deadline status
  async updateDeadlineStatus(deadlineId, status) {
    try {
      const query = `
        UPDATE deadlines 
        SET status = $1, updated_at = NOW()
        WHERE id = $2
      `;
      
      await pool.query(query, [status, deadlineId]);
    } catch (error) {
      console.error(`❌ Error updating deadline status:`, error);
    }
  }

  // Check if overdue notification should be sent
  async shouldSendOverdueNotification(deadlineId) {
    try {
      const query = `
        SELECT notifications_sent, due_date, status
        FROM deadlines
        WHERE id = $1
      `;
      
      const result = await pool.query(query, [deadlineId]);
      if (!result.rows.length) {
        console.log(`⚠️ Deadline ${deadlineId} not found`);
        return false;
      }

      const deadline = result.rows[0];
      const notificationsSent = deadline.notifications_sent || {};
      const dueDate = new Date(deadline.due_date);
      const now = new Date();
      
      // Calculate how long ago the deadline was due
      const hoursOverdue = (now - dueDate) / (1000 * 60 * 60);
      
      // Send overdue notification if:
      // 1. No overdue notification has been sent yet, OR
      // 2. Last notification was sent more than 24 hours ago
      const lastOverdueNotification = notificationsSent.overdue;
      
      if (!lastOverdueNotification) {
        console.log(`📨 No previous overdue notification for deadline ${deadlineId} - sending now (${Math.round(hoursOverdue * 100) / 100} hours overdue)`);
        return true;
      }
      
      const lastSent = new Date(lastOverdueNotification);
      const hoursSinceLastNotification = (now - lastSent) / (1000 * 60 * 60);
      
      console.log(`⏰ Deadline ${deadlineId} - Last overdue notification sent ${Math.round(hoursSinceLastNotification * 100) / 100} hours ago, overdue by ${Math.round(hoursOverdue * 100) / 100} hours`);
      
      // Only send if it's been more than 24 hours since last notification
      // AND the deadline became overdue within a reasonable timeframe (not ancient deadlines)
      const shouldSend = hoursSinceLastNotification >= 24 && hoursOverdue <= 168; // Don't spam for deadlines overdue more than 1 week
      console.log(`📋 Deadline ${deadlineId} - Should send notification: ${shouldSend}`);
      
      return shouldSend;
      
    } catch (error) {
      console.error('❌ Error checking overdue notification status:', error);
      // If we can't check, err on the side of caution and don't send
      return false;
    }
  }

  // Send overdue notification to all collaborators
  async sendOverdueNotificationToAllCollaborators(deadline) {
    try {
      // Get all users who should receive notifications for this deadline
      const recipients = await DeadlineCollaborator.getNotificationRecipients(deadline.id);
      
      const overdueDuration = this.calculateOverdueDuration(deadline.due_date);
      let successCount = 0;
      let failureCount = 0;

      for (const recipient of recipients) {
        // Check if user has overdue notifications enabled
        let hasOverdueEnabled = false;
        let hasInAppOverdueEnabled = false;
        
        try {
          hasOverdueEnabled = await User.hasOverdueNotificationsEnabled(recipient.user_id);
        } catch (error) {
          console.error(`❌ Error checking email overdue notifications for user ${recipient.user_id}:`, error);
          hasOverdueEnabled = false;
        }
        
        try {
          hasInAppOverdueEnabled = await User.hasInAppOverdueNotificationsEnabled(recipient.user_id);
        } catch (error) {
          console.error(`❌ Error checking in-app overdue notifications for user ${recipient.user_id}:`, error);
          // Default to true if method doesn't exist or fails
          hasInAppOverdueEnabled = true;
        }
        
        if (!hasOverdueEnabled && !hasInAppOverdueEnabled) {
          console.log(`🔕 Skipping overdue notification for: ${deadline.title} to ${recipient.email} (all overdue notifications disabled)`);
          continue;
        }

        const user = {
          email: recipient.email,
          username: recipient.username,
          full_name: recipient.full_name
        };

        let emailSuccess = false;
        let inAppSuccess = false;

        // Send overdue email notification if enabled
        if (hasOverdueEnabled) {
          const emailResult = await emailService.sendOverdueNotification(user, deadline, overdueDuration);
          if (emailResult.success) {
            emailSuccess = true;
            console.log(`✅ Sent overdue email notification for: ${deadline.title} to ${user.email} (${recipient.role})`);
          } else {
            console.error(`❌ Failed to send overdue email for: ${deadline.title} to ${user.email}`, emailResult.error);
          }
        }

        // Send in-app overdue notification if enabled
        if (hasInAppOverdueEnabled) {
          try {
            console.log(`📱 Creating in-app overdue notification for user ${recipient.user_id}...`);
            const notificationResult = await InAppNotification.createOverdueNotification(recipient.user_id, deadline, overdueDuration);
            console.log(`📱 Notification result:`, notificationResult);
            inAppSuccess = true;
            console.log(`✅ Created overdue in-app notification for: ${deadline.title} for user ${recipient.user_id} (${recipient.role})`);
          } catch (error) {
            console.error(`❌ Failed to create in-app overdue notification for: ${deadline.title} for user ${recipient.user_id}`, error);
            console.error(`❌ Error details:`, error.stack);
          }
        } else {
          console.log(`🔕 In-app overdue notifications disabled for user ${recipient.user_id}`);
        }

        if (emailSuccess || inAppSuccess) {
          successCount++;
        } else {
          failureCount++;
        }
      }

      // Mark notification as sent if at least one notification was successful
      if (successCount > 0) {
        await this.markNotificationSent(deadline.id, 'overdue');
        console.log(`🚨 Overdue notification summary for "${deadline.title}": ${successCount} sent, ${failureCount} failed`);
      }

    } catch (error) {
      console.error(`❌ Error sending overdue notifications for deadline ${deadline.id}:`, error);
    }
  }

  // Update overdue deadlines status (daily maintenance)
  async updateOverdueDeadlines() {
    try {
      const updatedDeadlines = await Deadline.updateOverdueDeadlines();
      console.log(`📅 Updated ${updatedDeadlines.length} deadlines to overdue status`);
    } catch (error) {
      console.error('❌ Error updating overdue deadlines:', error);
    }
  }

  // Send daily summary (optional feature)
  async sendDailySummary() {
    try {
      console.log('📊 Starting daily summary generation...');
      
      // Get users who want daily summaries with their deadline statistics
      const query = `
        WITH user_stats AS (
          SELECT 
            u.id,
            u.email,
            u.username,
            u.full_name,
            COUNT(DISTINCT d.id) as total_deadlines,
            COUNT(DISTINCT CASE WHEN DATE(d.due_date) = CURRENT_DATE THEN d.id END) as due_today,
            COUNT(DISTINCT CASE WHEN d.due_date BETWEEN NOW() AND NOW() + INTERVAL '7 days' AND d.status != 'completed' THEN d.id END) as upcoming_deadlines,
            COUNT(DISTINCT CASE WHEN d.status = 'overdue' THEN d.id END) as overdue_deadlines,
            COUNT(DISTINCT CASE WHEN d.status = 'completed' AND DATE(d.updated_at) = CURRENT_DATE THEN d.id END) as completed_today
          FROM users u
          LEFT JOIN deadline_collaborators dc ON u.id = dc.user_id
          LEFT JOIN deadlines d ON dc.deadline_id = d.id AND d.status NOT IN ('deleted')
          GROUP BY u.id, u.email, u.username, u.full_name
        )
        SELECT * FROM user_stats 
        WHERE total_deadlines > 0 OR completed_today > 0
      `;

      const result = await pool.query(query);
      const users = result.rows;

      console.log(`📊 Found ${users.length} users with deadline activity for daily summary`);

      let emailSummariesSent = 0;
      let inAppSummariesSent = 0;

      for (const user of users) {
        try {
          // Check user preferences for daily summary
          const hasEmailDailySummaryEnabled = await User.hasDailySummaryEnabled(user.id);
          const hasInAppDailySummaryEnabled = await User.hasInAppDailySummaryEnabled(user.id);

          if (!hasEmailDailySummaryEnabled && !hasInAppDailySummaryEnabled) {
            console.log(`🔕 Skipping daily summary for user ${user.email} (all daily summary notifications disabled)`);
            continue;
          }

          const summaryData = {
            total_deadlines: parseInt(user.total_deadlines) || 0,
            due_today: parseInt(user.due_today) || 0,
            upcoming_deadlines: parseInt(user.upcoming_deadlines) || 0,
            overdue_deadlines: parseInt(user.overdue_deadlines) || 0,
            completed_today: parseInt(user.completed_today) || 0
          };

          // Send email daily summary if enabled
          if (hasEmailDailySummaryEnabled) {
            try {
              const emailResult = await emailService.sendDailySummary(user, summaryData);
              if (emailResult.success) {
                emailSummariesSent++;
                console.log(`✅ Sent daily summary email to ${user.email}`);
              } else {
                console.error(`❌ Failed to send daily summary email to ${user.email}:`, emailResult.error);
              }
            } catch (error) {
              console.error(`❌ Error sending daily summary email to ${user.email}:`, error);
            }
          }

          // Send in-app daily summary if enabled
          if (hasInAppDailySummaryEnabled) {
            try {
              await InAppNotification.createDailySummary(user.id, summaryData);
              inAppSummariesSent++;
              console.log(`✅ Created daily summary in-app notification for user ${user.id}`);
            } catch (error) {
              console.error(`❌ Failed to create daily summary in-app notification for user ${user.id}:`, error);
            }
          }

        } catch (error) {
          console.error(`❌ Error processing daily summary for user ${user.email}:`, error);
        }
      }

      console.log(`📊 Daily summary completed: ${emailSummariesSent} emails sent, ${inAppSummariesSent} in-app notifications created`);
      
    } catch (error) {
      console.error('❌ Error sending daily summary:', error);
    }
  }

  // Utility function to format time remaining
  formatTimeRemaining(hours) {
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days} day${days > 1 ? 's' : ''}`;
    } else {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
  }

  // Calculate overdue duration
  calculateOverdueDuration(dueDate) {
    const now = new Date();
    const due = new Date(dueDate);
    const diffMs = now - due;
    
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} and ${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
  }

  // Manual trigger for testing
  async triggerNotificationCheck() {
    console.log('🔧 Manually triggering notification check...');
    await this.checkAndSendNotifications();
    await this.checkOverdueDeadlines();
  }

  // Get notification service status
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeTasks: this.scheduledTasks.length,
      nextRuns: this.scheduledTasks.map(task => ({
        running: task.running,
        destroyed: task.destroyed
      }))
    };
  }
}

module.exports = new NotificationService();