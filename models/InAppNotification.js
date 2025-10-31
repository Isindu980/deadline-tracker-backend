const pool = require('../config/db');

class InAppNotification {
  // Create in_app_notifications table if it doesn't exist
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS in_app_notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        deadline_id INTEGER REFERENCES deadlines(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL, -- 'reminder', 'overdue', 'deadline_shared', 'deadline_updated', etc.
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        data JSONB DEFAULT '{}'::jsonb, -- Additional data like deadline info, time remaining, etc.
        is_read BOOLEAN DEFAULT false,
        priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
        action_url VARCHAR(255), -- Optional URL for click action
        expires_at TIMESTAMP, -- Optional expiration date
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_id ON in_app_notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_in_app_notifications_deadline_id ON in_app_notifications(deadline_id);
      CREATE INDEX IF NOT EXISTS idx_in_app_notifications_type ON in_app_notifications(type);
      CREATE INDEX IF NOT EXISTS idx_in_app_notifications_is_read ON in_app_notifications(is_read);
      CREATE INDEX IF NOT EXISTS idx_in_app_notifications_created_at ON in_app_notifications(created_at);
    `;
    
    try {
      await pool.query(query);
      console.log('In-app notifications table created successfully');
    } catch (error) {
      console.error('Error creating in_app_notifications table:', error);
      throw error;
    }
  }

  // Create a new in-app notification
  static async create(notificationData) {
    const {
      user_id,
      deadline_id,
      type,
      title,
      message,
      data = {},
      priority = 'normal',
      action_url,
      expires_at
    } = notificationData;

    if (!user_id) {
      throw new Error('user_id is required for in-app notification');
    }

    const query = `
      INSERT INTO in_app_notifications (
        user_id, deadline_id, type, title, message, data, priority, action_url, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [
        user_id, deadline_id, type, title, message, 
        JSON.stringify(data), priority, action_url, expires_at
      ]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Get user's notifications with pagination and filtering
  static async getUserNotifications(userId, options = {}) {
    const {
      is_read,
      type,
      priority,
      limit = 20,
      offset = 0,
      order_by = 'created_at',
      order_direction = 'DESC'
    } = options;

    let query = `
      SELECT n.*, d.title as deadline_title, d.due_date
      FROM in_app_notifications n
      LEFT JOIN deadlines d ON n.deadline_id = d.id
      WHERE n.user_id = $1
    `;

    const params = [userId];
    let paramCount = 1;

    // Add filters
    if (is_read !== undefined) {
      paramCount++;
      query += ` AND n.is_read = $${paramCount}`;
      params.push(is_read);
    }

    if (type) {
      paramCount++;
      query += ` AND n.type = $${paramCount}`;
      params.push(type);
    }

    if (priority) {
      paramCount++;
      query += ` AND n.priority = $${paramCount}`;
      params.push(priority);
    }

    // Add expiration filter (exclude expired notifications)
    query += ` AND (n.expires_at IS NULL OR n.expires_at > CURRENT_TIMESTAMP)`;

    // Add ordering
    const validOrderFields = ['created_at', 'updated_at', 'priority', 'is_read'];
    const validDirections = ['ASC', 'DESC'];
    
    const orderField = validOrderFields.includes(order_by) ? order_by : 'created_at';
    const orderDir = validDirections.includes(order_direction.toUpperCase()) ? order_direction.toUpperCase() : 'DESC';
    
    query += ` ORDER BY n.${orderField} ${orderDir}`;

    // Add pagination
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    try {
      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  // Get unread notification count for user
  static async getUnreadCount(userId) {
    const query = `
      SELECT COUNT(*) as unread_count
      FROM in_app_notifications
      WHERE user_id = $1 AND is_read = false
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `;

    try {
      const result = await pool.query(query, [userId]);
      return parseInt(result.rows[0].unread_count) || 0;
    } catch (error) {
      throw error;
    }
  }

  // Mark notification as read
  static async markAsRead(notificationId, userId) {
    const query = `
      UPDATE in_app_notifications 
      SET is_read = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [notificationId, userId]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Mark all notifications as read for user
  static async markAllAsRead(userId) {
    const query = `
      UPDATE in_app_notifications 
      SET is_read = true, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND is_read = false
      RETURNING id
    `;

    try {
      const result = await pool.query(query, [userId]);
      // Return the count of updated rows
      return { updated_count: result.rowCount };
    } catch (error) {
      throw error;
    }
  }

  // Delete notification
  static async delete(notificationId, userId) {
    const query = `
      DELETE FROM in_app_notifications 
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;

    try {
      const result = await pool.query(query, [notificationId, userId]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Delete all read notifications for user (cleanup)
  static async deleteAllRead(userId) {
    const query = `
      DELETE FROM in_app_notifications 
      WHERE user_id = $1 AND is_read = true
      RETURNING COUNT(*) as deleted_count
    `;

    try {
      const result = await pool.query(query, [userId]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Clean up expired notifications
  static async cleanupExpired() {
    const query = `
      DELETE FROM in_app_notifications 
      WHERE expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP
      RETURNING COUNT(*) as deleted_count
    `;

    try {
      const result = await pool.query(query);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Create deadline reminder notification
  static async createDeadlineReminder(userId, deadline, timeRemaining, notificationType) {
    const title = `Deadline Reminder: ${deadline.title}`;
    const message = `Your deadline "${deadline.title}" is due in ${timeRemaining}. Don't forget to complete it!`;
    
    const data = {
      deadline_id: deadline.id,
      due_date: deadline.due_date,
      time_remaining: timeRemaining,
      notification_type: notificationType,
      priority: deadline.priority
    };

    const priority = this.mapDeadlinePriorityToNotificationPriority(deadline.priority);
    const action_url = `/deadlines/${deadline.id}`;
    
    return await this.create({
      user_id: userId,
      deadline_id: deadline.id,
      type: 'reminder',
      title,
      message,
      data,
      priority,
      action_url
    });
  }

  // Create overdue notification
  static async createOverdueNotification(userId, deadline, overdueDuration) {
    const title = `🚨 Deadline Overdue: ${deadline.title}`;
    const message = `DEADLINE OVERDUE! "${deadline.title}" was due ${overdueDuration} ago. This deadline needs immediate attention.`;
    
    const data = {
      deadline_id: deadline.id,
      due_date: deadline.due_date,
      overdue_duration: overdueDuration,
      priority: deadline.priority,
      notification_type: 'overdue_alert'
    };

    const action_url = `/deadlines/${deadline.id}`;
    
    return await this.create({
      user_id: userId,
      deadline_id: deadline.id,
      type: 'overdue',
      title,
      message,
      data,
      priority: 'urgent',
      action_url
    });
  }

  // Create daily summary notification
  static async createDailySummary(userId, summaryData) {
    const { 
      total_deadlines, 
      upcoming_deadlines, 
      overdue_deadlines, 
      completed_today,
      due_today 
    } = summaryData;

    let message = `📊 Daily Summary: `;
    const summaryParts = [];

    if (total_deadlines > 0) {
      summaryParts.push(`${total_deadlines} active deadline${total_deadlines > 1 ? 's' : ''}`);
    }
    
    if (due_today > 0) {
      summaryParts.push(`${due_today} due today`);
    }
    
    if (upcoming_deadlines > 0) {
      summaryParts.push(`${upcoming_deadlines} due this week`);
    }
    
    if (overdue_deadlines > 0) {
      summaryParts.push(`${overdue_deadlines} overdue`);
    }
    
    if (completed_today > 0) {
      summaryParts.push(`${completed_today} completed today`);
    }

    if (summaryParts.length === 0) {
      message += "No active deadlines. Great job! 🎉";
    } else {
      message += summaryParts.join(", ");
    }

    const data = {
      summary: summaryData,
      generated_at: new Date().toISOString()
    };

    const priority = overdue_deadlines > 0 ? 'high' : (due_today > 0 ? 'normal' : 'low');
    
    return await this.create({
      user_id: userId,
      deadline_id: null, // No specific deadline for summary
      type: 'daily_summary',
      title: '📊 Daily Deadline Summary',
      message,
      data,
      priority,
      action_url: '/deadlines'
    });
  }

  // Helper method to map deadline priority to notification priority
  static mapDeadlinePriorityToNotificationPriority(deadlinePriority) {
    const priorityMap = {
      'low': 'low',
      'medium': 'normal',
      'high': 'high',
      'urgent': 'urgent'
    };
    return priorityMap[deadlinePriority] || 'normal';
  }
}

module.exports = InAppNotification;