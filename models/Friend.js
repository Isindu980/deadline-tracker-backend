const pool = require('../config/db');

class Friend {
  // Create friends table if it doesn't exist
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS friends (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        friend_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
        requested_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, friend_id),
        CHECK (user_id != friend_id)
      )
    `;
    
    try {
      await pool.query(query);
      console.log('Friends table created successfully');
    } catch (error) {
      console.error('Error creating friends table:', error);
      throw error;
    }
  }

  // Send friend request
  static async sendFriendRequest(userId, friendId) {
    try {
      // Check if friendship already exists
      const existingFriendship = await this.getFriendshipStatus(userId, friendId);
      if (existingFriendship) {
        throw new Error('Friendship request already exists or users are already friends');
      }

      // Create bidirectional friendship records
      const query = `
        INSERT INTO friends (user_id, friend_id, status, requested_by)
        VALUES 
          ($1, $2, 'pending', $1),
          ($2, $1, 'pending', $1)
        RETURNING *
      `;
      
      const result = await pool.query(query, [userId, friendId]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Accept friend request
  static async acceptFriendRequest(userId, friendId) {
    try {
      const query = `
        UPDATE friends 
        SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
        WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
        RETURNING *
      `;
      
      const result = await pool.query(query, [userId, friendId]);
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  // Decline friend request
  static async declineFriendRequest(userId, friendId) {
    try {
      const query = `
        UPDATE friends 
        SET status = 'declined', updated_at = CURRENT_TIMESTAMP
        WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
        RETURNING *
      `;
      
      const result = await pool.query(query, [userId, friendId]);
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  // Remove friend/Cancel request
  static async removeFriend(userId, friendId) {
    try {
      const query = `
        DELETE FROM friends 
        WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
        RETURNING *
      `;
      
      const result = await pool.query(query, [userId, friendId]);
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  // Block user
  static async blockUser(userId, friendId) {
    try {
      // First remove any existing friendship
      await this.removeFriend(userId, friendId);
      
      // Create a blocked relationship
      const query = `
        INSERT INTO friends (user_id, friend_id, status, requested_by)
        VALUES ($1, $2, 'blocked', $1)
        ON CONFLICT (user_id, friend_id) 
        DO UPDATE SET status = 'blocked', updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      
      const result = await pool.query(query, [userId, friendId]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Unblock user
  static async unblockUser(userId, friendId) {
    try {
      // Remove the blocked relationship
      const query = `
        DELETE FROM friends 
        WHERE user_id = $1 AND friend_id = $2 AND status = 'blocked'
        RETURNING *
      `;
      
      const result = await pool.query(query, [userId, friendId]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Get friendship status between two users
  static async getFriendshipStatus(userId, friendId) {
    try {
      const query = `
        SELECT * FROM friends 
        WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
        LIMIT 1
      `;
      
      const result = await pool.query(query, [userId, friendId]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Get user's friends list
  static async getFriends(userId, status = 'accepted') {
    try {
      const query = `
        SELECT DISTINCT
          CASE 
            WHEN f.user_id = $1 THEN f.friend_id
            ELSE f.user_id
          END as friend_user_id,
          u.username, u.full_name, u.email, u.created_at as user_created_at,
          MIN(f.id) as friendship_id,
          MIN(f.created_at) as friendship_created,
          f.status as friendship_status
        FROM friends f
        JOIN users u ON (
          CASE 
            WHEN f.user_id = $1 THEN u.id = f.friend_id
            ELSE u.id = f.user_id
          END
        )
        WHERE (f.user_id = $1 OR f.friend_id = $1) 
        AND f.status = $2
        GROUP BY 
          CASE 
            WHEN f.user_id = $1 THEN f.friend_id
            ELSE f.user_id
          END,
          u.username, u.full_name, u.email, u.created_at, f.status
        ORDER BY u.username
      `;
      
      const result = await pool.query(query, [userId, status]);
      return result.rows.map(row => ({
        friendship_id: row.friendship_id,
        user_id: row.friend_user_id,
        username: row.username,
        full_name: row.full_name,
        email: row.email,
        friendship_status: row.friendship_status,
        friendship_created: row.friendship_created,
        user_created: row.user_created_at
      }));
    } catch (error) {
      throw error;
    }
  }

  // Get pending friend requests (incoming)
  static async getPendingRequests(userId) {
    try {
      const query = `
        SELECT DISTINCT f.id, f.user_id, f.friend_id, f.status, f.requested_by, f.created_at, f.updated_at,
               u.username, u.full_name, u.email, u.created_at as user_created_at
        FROM friends f
        JOIN users u ON u.id = f.requested_by
        WHERE f.user_id = $1 AND f.status = 'pending' AND f.requested_by != $1
        ORDER BY f.created_at DESC
      `;
      
      const result = await pool.query(query, [userId]);
      
      return result.rows.map(row => ({
        request_id: row.id,
        user_id: row.requested_by,
        username: row.username,
        full_name: row.full_name,
        email: row.email,
        requested_at: row.created_at,
        user_created: row.user_created_at
      }));
    } catch (error) {
      throw error;
    }
  }

  // Get sent friend requests (outgoing)
  static async getSentRequests(userId) {
    try {
      const query = `
        SELECT DISTINCT f.id, f.user_id, f.friend_id, f.status, f.requested_by, f.created_at, f.updated_at,
               u.username, u.full_name, u.email, u.created_at as user_created_at
        FROM friends f
        JOIN users u ON u.id = f.friend_id
        WHERE f.user_id = $1 AND f.status = 'pending' AND f.requested_by = $1
        ORDER BY f.created_at DESC
      `;
      
      const result = await pool.query(query, [userId]);
      return result.rows.map(row => ({
        request_id: row.id,
        user_id: row.friend_id,
        username: row.username,
        full_name: row.full_name,
        email: row.email,
        requested_at: row.created_at,
        user_created: row.user_created_at
      }));
    } catch (error) {
      throw error;
    }
  }

  // Search for users to add as friends (with relationship status)
  static async searchUsers(userId, searchTerm, limit = 10) {
    try {
      const query = `
        SELECT DISTINCT
          u.id, 
          u.username, 
          u.full_name, 
          u.email, 
          u.created_at,
          COALESCE(
            (SELECT 
              CASE 
                WHEN f.status = 'accepted' THEN 'friends'
                WHEN f.status = 'pending' AND f.requested_by = $1 THEN 'request_sent'
                WHEN f.status = 'pending' AND f.requested_by != $1 THEN 'request_received'
                WHEN f.status = 'blocked' THEN 'blocked'
                WHEN f.status = 'declined' THEN 'declined'
                ELSE 'none'
              END
             FROM friends f 
             WHERE (f.user_id = $1 AND f.friend_id = u.id) 
             LIMIT 1), 
            'none'
          ) as relationship_status
        FROM users u
        WHERE u.id != $1
        AND (u.username ILIKE $2 OR u.full_name ILIKE $2 OR u.email ILIKE $2)
        ORDER BY u.username
        LIMIT $3
      `;
      
      const result = await pool.query(query, [userId, `%${searchTerm}%`, limit]);
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  // Get friend statistics
  static async getFriendStats(userId) {
    try {
      const query = `
        SELECT 
          COUNT(DISTINCT CASE 
            WHEN status = 'accepted' THEN 
              CASE WHEN user_id = $1 THEN friend_id ELSE user_id END
            END) as total_friends,
          COUNT(CASE WHEN status = 'pending' AND friend_id = $1 AND requested_by != $1 THEN 1 END) as pending_requests,
          COUNT(CASE WHEN status = 'pending' AND user_id = $1 AND requested_by = $1 THEN 1 END) as sent_requests,
          COUNT(CASE WHEN status = 'blocked' AND user_id = $1 THEN 1 END) as blocked_users
        FROM friends
        WHERE user_id = $1 OR friend_id = $1
      `;
      
      const result = await pool.query(query, [userId]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Check if users are friends
  static async areFriends(userId, friendId) {
    try {
      const friendship = await this.getFriendshipStatus(userId, friendId);
      return friendship && friendship.status === 'accepted';
    } catch (error) {
      throw error;
    }
  }

  // Get mutual friends between two users
  static async getMutualFriends(userId, otherUserId) {
    try {
      const query = `
        SELECT DISTINCT u.id, u.username, u.full_name
        FROM users u
        WHERE u.id IN (
          SELECT DISTINCT 
            CASE 
              WHEN f1.user_id = $1 THEN f1.friend_id
              ELSE f1.user_id
            END as friend_id
          FROM friends f1
          WHERE (f1.user_id = $1 OR f1.friend_id = $1) 
          AND f1.status = 'accepted'
        )
        AND u.id IN (
          SELECT DISTINCT 
            CASE 
              WHEN f2.user_id = $2 THEN f2.friend_id
              ELSE f2.user_id
            END as friend_id
          FROM friends f2
          WHERE (f2.user_id = $2 OR f2.friend_id = $2) 
          AND f2.status = 'accepted'
        )
        AND u.id NOT IN ($1, $2)
        ORDER BY u.username
      `;
      
      const result = await pool.query(query, [userId, otherUserId]);
      return result.rows;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Friend;