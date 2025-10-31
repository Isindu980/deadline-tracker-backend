const pool = require('../config/db');

class Deadline {
  // Create deadlines table if it doesn't exist
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS deadlines (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        due_date TIMESTAMP NOT NULL,
        priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue')),
        category VARCHAR(50),
        subject VARCHAR(100),
        estimated_hours INTEGER,
        actual_hours INTEGER,
        completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
        notes TEXT,
        collaborators JSONB DEFAULT '[]',
        notifications_sent JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `;
    
    try {
      await pool.query(query);
      console.log('Deadlines table created successfully');
    } catch (error) {
      console.error('Error creating deadlines table:', error);
      throw error;
    }
  }

  // Create a new deadline
  static async create(deadlineData) {
    const {
      student_id,
      title,
      description,
      due_date,
      priority = 'medium',
      status = 'pending',
      category,
      subject,
      estimated_hours,
      notes
    } = deadlineData;
    
    const query = `
      INSERT INTO deadlines (student_id, title, description, due_date, priority, status, category, subject, estimated_hours, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    try {
      const result = await pool.query(query, [
        student_id, title, description, due_date, priority, status, category, subject, estimated_hours, notes
      ]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Find deadline by ID
  static async findById(id) {
    const query = `
      SELECT d.*, u.username, u.full_name as student_name
      FROM deadlines d
      LEFT JOIN users u ON d.student_id = u.id
      WHERE d.id = $1
    `;
    
    try {
      const result = await pool.query(query, [id]);
      const deadline = result.rows[0];
      
      if (deadline) {
        // Ensure collaborators field is parsed if it exists
        if (deadline.collaborators && typeof deadline.collaborators === 'string') {
          deadline.collaborators = JSON.parse(deadline.collaborators);
        } else if (!deadline.collaborators) {
          deadline.collaborators = [];
        }
      }
      
      return deadline;
    } catch (error) {
      throw error;
    }
  }

  // Get all deadlines with optional filtering
  static async findAll(filters = {}) {
    let query = `
      SELECT d.*, u.username, u.full_name as student_name
      FROM deadlines d
      LEFT JOIN users u ON d.student_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;

    // Add filters
    if (filters.student_id) {
      paramCount++;
      query += ` AND d.student_id = $${paramCount}`;
      params.push(filters.student_id);
    }

    if (filters.status) {
      paramCount++;
      query += ` AND d.status = $${paramCount}`;
      params.push(filters.status);
    }

    if (filters.priority) {
      paramCount++;
      query += ` AND d.priority = $${paramCount}`;
      params.push(filters.priority);
    }

    if (filters.category) {
      paramCount++;
      query += ` AND d.category = $${paramCount}`;
      params.push(filters.category);
    }

    if (filters.subject) {
      paramCount++;
      query += ` AND d.subject = $${paramCount}`;
      params.push(filters.subject);
    }

    if (filters.search) {
      paramCount++;
      query += ` AND (d.title ILIKE $${paramCount} OR d.description ILIKE $${paramCount})`;
      params.push(`%${filters.search}%`);
    }

    // Add sorting
    const sortBy = filters.sortBy || 'due_date';
    const sortOrder = filters.sortOrder || 'ASC';
    query += ` ORDER BY d.${sortBy} ${sortOrder}`;

    // Add pagination
    if (filters.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(filters.limit);
    }

    if (filters.offset) {
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(filters.offset);
    }

    try {
      const result = await pool.query(query, params);
      
      // Ensure collaborators field is properly parsed for each deadline
      const deadlinesWithParsedCollaborators = result.rows.map(deadline => {
        if (deadline.collaborators && typeof deadline.collaborators === 'string') {
          deadline.collaborators = JSON.parse(deadline.collaborators);
        } else if (!deadline.collaborators) {
          deadline.collaborators = [];
        }
        return deadline;
      });
      
      return deadlinesWithParsedCollaborators;
    } catch (error) {
      throw error;
    }
  }

  // Get deadlines by student ID
  static async findByStudentId(studentId, filters = {}) {
    return this.findAll({ ...filters, student_id: studentId });
  }

  // Get upcoming deadlines (within specified days)
  static async getUpcoming(days = 7, studentId = null) {
    let query = `
      SELECT d.*, u.username, u.full_name as student_name
      FROM deadlines d
      LEFT JOIN users u ON d.student_id = u.id
      WHERE d.due_date >= CURRENT_TIMESTAMP 
      AND d.due_date <= CURRENT_TIMESTAMP + INTERVAL '${days} days'
      AND d.status != 'completed'
    `;

    const params = [];
    if (studentId) {
      query += ' AND d.student_id = $1';
      params.push(studentId);
    }

    query += ' ORDER BY d.due_date ASC';

    try {
      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  // Get overdue deadlines
  static async getOverdue(studentId = null) {
    let query = `
      SELECT d.*, u.username, u.full_name as student_name
      FROM deadlines d
      LEFT JOIN users u ON d.student_id = u.id
      WHERE d.due_date < CURRENT_TIMESTAMP 
      AND d.status != 'completed'
    `;

    const params = [];
    if (studentId) {
      query += ' AND d.student_id = $1';
      params.push(studentId);
    }

    query += ' ORDER BY d.due_date ASC';

    try {
      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  // Update deadline
  static async update(id, deadlineData) {
    const {
      title,
      description,
      due_date,
      priority,
      status,
      category,
      subject,
      estimated_hours,
      actual_hours,
      completion_percentage,
      notes
    } = deadlineData;

    const query = `
      UPDATE deadlines 
      SET title = $1, description = $2, due_date = $3, priority = $4, status = $5,
          category = $6, subject = $7, estimated_hours = $8, actual_hours = $9,
          completion_percentage = $10, notes = $11, updated_at = CURRENT_TIMESTAMP,
          completed_at = CASE WHEN $12 = 'completed' AND status != 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END
      WHERE id = $13
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [
        title, description, due_date, priority, status, category, subject,
        estimated_hours, actual_hours, completion_percentage, notes, status, id
      ]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Update only status
  static async updateStatus(id, status) {
    const query = `
      UPDATE deadlines 
      SET status = $1, updated_at = CURRENT_TIMESTAMP,
          completed_at = CASE WHEN $3 = 'completed' AND status != 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END
      WHERE id = $2
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [status, id, status]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Delete deadline
  static async delete(id) {
    const query = 'DELETE FROM deadlines WHERE id = $1 RETURNING id';

    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Get deadline statistics for a student
  static async getStats(studentId = null) {
    let query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN due_date < CURRENT_TIMESTAMP AND status != 'completed' THEN 1 END) as overdue,
        COUNT(CASE WHEN priority = 'urgent' THEN 1 END) as urgent,
        COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority
      FROM deadlines
    `;

    const params = [];
    if (studentId) {
      query += ' WHERE student_id = $1';
      params.push(studentId);
    }

    try {
      const result = await pool.query(query, params);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Auto-update overdue deadlines
  static async updateOverdueDeadlines() {
    const query = `
      UPDATE deadlines 
      SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
      WHERE due_date < CURRENT_TIMESTAMP 
      AND status NOT IN ('completed', 'overdue')
      RETURNING id, title
    `;

    try {
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  // Create a copy of a deadline for a specific user
  static async createCopy(originalDeadlineId, newOwnerId, copyData = {}) {
    try {
      // Get the original deadline
      const originalQuery = `
        SELECT title, description, due_date, priority, category, subject, estimated_hours, notes
        FROM deadlines 
        WHERE id = $1
      `;
      
      const originalResult = await pool.query(originalQuery, [originalDeadlineId]);
      if (!originalResult.rows.length) {
        throw new Error('Original deadline not found');
      }
      
      const original = originalResult.rows[0];
      
      // Create the copy with optional overrides
      const copyQuery = `
        INSERT INTO deadlines (
          student_id, title, description, due_date, priority, status, 
          category, subject, estimated_hours, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;
      
      const titleSuffix = copyData.titleSuffix || ' (Copy)';
      
      // Smart title handling - don't add duplicate suffixes
      let newTitle = copyData.title;
      if (!newTitle) {
        // If the original title already has a copy suffix, use base title
        if (original.title.includes('(Copy)') || original.title.includes('(My Copy)')) {
          const baseTitle = original.title.replace(/\s*\(My Copy\)|\s*\(Copy\)/g, '').trim();
          newTitle = baseTitle + titleSuffix;
        } else {
          newTitle = original.title + titleSuffix;
        }
      }
      const newStatus = copyData.status || 'pending'; // Reset status for copies
      
      const result = await pool.query(copyQuery, [
        newOwnerId,
        newTitle,
        original.description,
        original.due_date,
        original.priority,
        newStatus,
        original.category,
        original.subject,
        original.estimated_hours,
        original.notes
      ]);
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Update collaborators field in deadline
  static async updateCollaborators(deadlineId, collaborators) {
    try {
      const query = `
        UPDATE deadlines 
        SET collaborators = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;
      
      const result = await pool.query(query, [deadlineId, JSON.stringify(collaborators)]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Sync collaborators from deadline_collaborators table to deadline.collaborators field
  static async syncCollaborators(deadlineId) {
    try {
      // Get collaborators from deadline_collaborators table
      const collaboratorsQuery = `
        SELECT dc.user_id, dc.role, dc.can_edit, dc.can_delete, dc.joined_at,
               u.username, u.full_name, u.email
        FROM deadline_collaborators dc
        JOIN users u ON dc.user_id = u.id
        WHERE dc.deadline_id = $1
        ORDER BY dc.role DESC, u.username
      `;
      
      const collaboratorsResult = await pool.query(collaboratorsQuery, [deadlineId]);
      const collaborators = collaboratorsResult.rows;
      
      // Update the deadline table with collaborators data
      await this.updateCollaborators(deadlineId, collaborators);
      
      console.log(`📊 Synced ${collaborators.length} collaborators for deadline ${deadlineId}`);
      return collaborators;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Deadline;
