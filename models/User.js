const pool = require('../config/db');
const bcrypt = require('bcrypt');

class User {
  // Find user by reset token
  static async findByResetToken(token) {
    const query = 'SELECT * FROM users WHERE reset_token = $1';
    try {
      const result = await pool.query(query, [token]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Clear reset token and expiry
  static async clearResetToken(id) {
    const query = `
      UPDATE users
      SET reset_token = NULL, reset_token_expires = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id
    `;
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  // Set password reset token and expiry
  static async setResetToken(id, token, expires) {
    const query = `
      UPDATE users
      SET reset_token = $1, reset_token_expires = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id, reset_token, reset_token_expires
    `;
    try {
      const result = await pool.query(query, [token, expires, id]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }
  // Create users table if it doesn't exist
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        full_name VARCHAR(100),
        role VARCHAR(20) DEFAULT 'student',
        notification_preferences JSONB DEFAULT '{"email_enabled": true, "in_app_enabled": true, "reminders": {"2_days": true, "1_day": true, "12_hours": true, "1_hour": true}, "overdue_notifications": true, "daily_summary": false, "in_app_reminders": {"2_days": true, "1_day": true, "12_hours": true, "1_hour": true}, "in_app_overdue": true}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    try {
      await pool.query(query);
      console.log('Users table created successfully');
      
      // Add notification_preferences column if it doesn't exist (for existing installations)
      const alterQuery = `
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='notification_preferences') THEN
            ALTER TABLE users ADD COLUMN notification_preferences JSONB DEFAULT '{"email_enabled": true, "in_app_enabled": true, "reminders": {"2_days": true, "1_day": true, "12_hours": true, "1_hour": true}, "overdue_notifications": true, "daily_summary": false, "in_app_reminders": {"2_days": true, "1_day": true, "12_hours": true, "1_hour": true}, "in_app_overdue": true}'::jsonb;
          END IF;
        END $$;
      `;
      await pool.query(alterQuery);
    } catch (error) {
      console.error('Error creating users table:', error);
      throw error;
    }
  }

  // Create a new user
  static async create(userData) {
    const { username, email, password, full_name, role = 'student' } = userData;
    
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    const query = `
      INSERT INTO users (username, email, password, full_name, role)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, email, full_name, role, created_at
    `;
    
    try {
      const result = await pool.query(query, [username, email, hashedPassword, full_name, role]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Find user by email
  static async findByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = $1';
    
    try {
      const result = await pool.query(query, [email]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Find user by username
  static async findByUsername(username) {
    const query = 'SELECT * FROM users WHERE username = $1';
    
    try {
      const result = await pool.query(query, [username]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Find user by ID
  static async findById(id) {
    const query = 'SELECT id, username, email, full_name, role, created_at FROM users WHERE id = $1';
    
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Get all users with pagination
  static async findAll(limit = 10, offset = 0) {
    const query = `
      SELECT id, username, email, full_name, role, created_at 
      FROM users 
      ORDER BY created_at DESC 
      LIMIT $1 OFFSET $2
    `;
    
    try {
      const result = await pool.query(query, [limit, offset]);
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  // Update user
  static async update(id, userData) {
    const { username, email, full_name, role } = userData;
    
    const query = `
      UPDATE users 
      SET username = $1, email = $2, full_name = $3, role = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING id, username, email, full_name, role, updated_at
    `;
    
    try {
      const result = await pool.query(query, [username, email, full_name, role, id]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Update password
  static async updatePassword(id, newPassword) {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    const query = `
      UPDATE users 
      SET password = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, username, email
    `;
    
    try {
      const result = await pool.query(query, [hashedPassword, id]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Delete user
  static async delete(id) {
    const query = 'DELETE FROM users WHERE id = $1 RETURNING id';
    
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Verify password
  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  // Check if email exists
  static async emailExists(email, excludeId = null) {
    let query = 'SELECT id FROM users WHERE email = $1';
    let params = [email];
    
    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }
    
    try {
      const result = await pool.query(query, params);
      return result.rows.length > 0;
    } catch (error) {
      throw error;
    }
  }

  // Check if username exists
  static async usernameExists(username, excludeId = null) {
    let query = 'SELECT id FROM users WHERE username = $1';
    let params = [username];
    
    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }
    
    try {
      const result = await pool.query(query, params);
      return result.rows.length > 0;
    } catch (error) {
      throw error;
    }
  }

  // Get user notification preferences
  static async getNotificationPreferences(userId) {
    const query = 'SELECT notification_preferences FROM users WHERE id = $1';
    
    try {
      const result = await pool.query(query, [userId]);
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }
      
      return result.rows[0].notification_preferences;
    } catch (error) {
      throw error;
    }
  }

  // Update user notification preferences
  static async updateNotificationPreferences(userId, preferences) {
    const query = `
      UPDATE users 
      SET notification_preferences = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING notification_preferences
    `;
    
    try {
      const result = await pool.query(query, [JSON.stringify(preferences), userId]);
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }
      
      return result.rows[0].notification_preferences;
    } catch (error) {
      throw error;
    }
  }

  // Check if user has email notifications enabled
  static async hasEmailNotificationsEnabled(userId) {
    try {
      const preferences = await this.getNotificationPreferences(userId);
      return preferences && preferences.email_enabled !== false;
    } catch (error) {
      console.error('Error checking email preferences:', error);
      return true; // Default to enabled if error
    }
  }

  // Check if specific reminder type is enabled
  static async isReminderEnabled(userId, reminderType) {
    try {
      const preferences = await this.getNotificationPreferences(userId);
      return preferences && 
             preferences.email_enabled !== false && 
             preferences.reminders && 
             preferences.reminders[reminderType] !== false;
    } catch (error) {
      console.error('Error checking reminder preferences:', error);
      return true; // Default to enabled if error
    }
  }

  // Check if overdue notifications are enabled
  static async hasOverdueNotificationsEnabled(userId) {
    try {
      const preferences = await this.getNotificationPreferences(userId);
      return preferences && 
             preferences.email_enabled !== false && 
             preferences.overdue_notifications !== false;
    } catch (error) {
      console.error('Error checking overdue preferences:', error);
      return true; // Default to enabled if error
    }
  }

  // Check if daily summary is enabled
  static async hasDailySummaryEnabled(userId) {
    try {
      const preferences = await this.getNotificationPreferences(userId);
      return preferences && 
             preferences.email_enabled !== false && 
             preferences.daily_summary === true;
    } catch (error) {
      console.error('Error checking daily summary preferences:', error);
      return false; // Default to disabled if error
    }
  }

  // Check if in-app notifications are enabled
  static async hasInAppNotificationsEnabled(userId) {
    try {
      const preferences = await this.getNotificationPreferences(userId);
      return preferences && preferences.in_app_enabled !== false;
    } catch (error) {
      console.error('Error checking in-app notification preferences:', error);
      return true; // Default to enabled if error
    }
  }

  // Check if specific in-app reminder type is enabled
  static async isInAppReminderEnabled(userId, reminderType) {
    try {
      const preferences = await this.getNotificationPreferences(userId);
      return preferences && 
             preferences.in_app_enabled !== false && 
             preferences.in_app_reminders && 
             preferences.in_app_reminders[reminderType] !== false;
    } catch (error) {
      console.error('Error checking in-app reminder preferences:', error);
      return true; // Default to enabled if error
    }
  }

  // Check if in-app overdue notifications are enabled
  static async hasInAppOverdueNotificationsEnabled(userId) {
    try {
      const preferences = await this.getNotificationPreferences(userId);
      return preferences && 
             preferences.in_app_enabled !== false && 
             preferences.in_app_overdue !== false;
    } catch (error) {
      console.error('Error checking in-app overdue preferences:', error);
      return true; // Default to enabled if error
    }
  }

  // Check if in-app daily summary notifications are enabled
  static async hasInAppDailySummaryEnabled(userId) {
    try {
      const preferences = await this.getNotificationPreferences(userId);
      return preferences && 
             preferences.in_app_enabled !== false && 
             preferences.in_app_daily_summary !== false;
    } catch (error) {
      console.error('Error checking in-app daily summary preferences:', error);
      return false; // Default to disabled if error
    }
  }
}

module.exports = User;
