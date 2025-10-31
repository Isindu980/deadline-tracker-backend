const pool = require('../config/db');
// Import Deadline model - using lazy loading to avoid circular dependency issues
let Deadline;

class DeadlineCollaborator {
  // Create deadline_collaborators table if it doesn't exist
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS deadline_collaborators (
        id SERIAL PRIMARY KEY,
        deadline_id INTEGER REFERENCES deadlines(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) DEFAULT 'collaborator' CHECK (role IN ('owner', 'collaborator')),
        can_edit BOOLEAN DEFAULT true,
        can_delete BOOLEAN DEFAULT false,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(deadline_id, user_id)
      )
    `;
    
    try {
      await pool.query(query);
      console.log('Deadline collaborators table created successfully');
    } catch (error) {
      console.error('Error creating deadline collaborators table:', error);
      throw error;
    }
  }

  // Add collaborator to deadline
  static async addCollaborator(deadlineId, userId, role = 'collaborator', permissions = {}) {
    const { can_edit = true, can_delete = false } = permissions;
    
    try {
      const query = `
        INSERT INTO deadline_collaborators (deadline_id, user_id, role, can_edit, can_delete)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (deadline_id, user_id) 
        DO UPDATE SET role = $3, can_edit = $4, can_delete = $5, joined_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      
      const result = await pool.query(query, [deadlineId, userId, role, can_edit, can_delete]);
      
      // Sync collaborators to deadline table
      await this.syncCollaboratorsToDeadline(deadlineId);
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Add multiple collaborators to deadline
  static async addMultipleCollaborators(deadlineId, collaborators) {
    try {
      const results = [];
      
      for (const collaborator of collaborators) {
        const { user_id, role = 'collaborator', permissions = {} } = collaborator;
        const result = await this.addCollaborator(deadlineId, user_id, role, permissions);
        results.push(result);
      }
      
      return results;
    } catch (error) {
      throw error;
    }
  }

  // Remove collaborator from deadline
  static async removeCollaborator(deadlineId, userId) {
    try {
      const query = `
        DELETE FROM deadline_collaborators 
        WHERE deadline_id = $1 AND user_id = $2
        RETURNING *
      `;
      
      const result = await pool.query(query, [deadlineId, userId]);
      
      // Sync collaborators to deadline table
      await this.syncCollaboratorsToDeadline(deadlineId);
      
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Update collaborator permissions
  static async updateCollaborator(deadlineId, userId, updates) {
    const { role, can_edit, can_delete } = updates;
    
    try {
      let setParts = [];
      let params = [deadlineId, userId];
      let paramCount = 2;

      if (role !== undefined) {
        paramCount++;
        setParts.push(`role = $${paramCount}`);
        params.push(role);
      }

      if (can_edit !== undefined) {
        paramCount++;
        setParts.push(`can_edit = $${paramCount}`);
        params.push(can_edit);
      }

      if (can_delete !== undefined) {
        paramCount++;
        setParts.push(`can_delete = $${paramCount}`);
        params.push(can_delete);
      }

      if (setParts.length === 0) {
        throw new Error('No updates provided');
      }

      const query = `
        UPDATE deadline_collaborators 
        SET ${setParts.join(', ')}
        WHERE deadline_id = $1 AND user_id = $2
        RETURNING *
      `;
      
      const result = await pool.query(query, params);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Get deadline collaborators
  static async getCollaborators(deadlineId) {
    try {
      console.log('Getting collaborators for deadline:', deadlineId);
      
      // First get actual database collaborators (for traditional collaboration)
      const dbQuery = `
        SELECT dc.*, u.username, u.full_name, u.email
        FROM deadline_collaborators dc
        JOIN users u ON dc.user_id = u.id
        WHERE dc.deadline_id = $1 AND dc.role = 'collaborator'
        ORDER BY u.username
      `;
      
      const dbResult = await pool.query(dbQuery, [deadlineId]);
      console.log(`Found ${dbResult.rows.length} database collaborators for deadline ${deadlineId}:`, dbResult.rows);
      
      // Also get copy collaborators from JSONB field (for copy-based collaboration tracking)
      const jsonbQuery = `
        SELECT collaborators
        FROM deadlines
        WHERE id = $1
      `;
      
      const jsonbResult = await pool.query(jsonbQuery, [deadlineId]);
      let copyCollaborators = [];
      
      if (jsonbResult.rows.length > 0 && jsonbResult.rows[0].collaborators) {
        const allCollaborators = jsonbResult.rows[0].collaborators;
        
        // Filter for copy_collaborators (excluding the owner)
        copyCollaborators = allCollaborators.filter(collab => 
          collab.role === 'copy_collaborator' || collab.has_copy === true
        );
        
        console.log(`Found ${copyCollaborators.length} copy collaborators in JSONB for deadline ${deadlineId}:`, copyCollaborators);
      }
      
      // Combine both types of collaborators
      const allCollaborators = [...dbResult.rows, ...copyCollaborators];
      console.log(`Total collaborators for deadline ${deadlineId}: ${allCollaborators.length}`);
      
      return allCollaborators;
    } catch (error) {
      console.error('Error getting collaborators:', error);
      throw error;
    }
  }

  // Get collaborator role and permissions
  static async getCollaboratorRole(deadlineId, userId) {
    try {
      const query = `
        SELECT role, can_edit, can_delete, joined_at
        FROM deadline_collaborators
        WHERE deadline_id = $1 AND user_id = $2
      `;
      
      const result = await pool.query(query, [deadlineId, userId]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Get deadlines where user is collaborator
  static async getUserCollaborations(userId, filters = {}) {
    try {
      let query = `
        SELECT d.*, dc.role, dc.can_edit, dc.can_delete, dc.joined_at,
               u.username as owner_username, u.full_name as owner_name
        FROM deadlines d
        JOIN deadline_collaborators dc ON d.id = dc.deadline_id
        LEFT JOIN users u ON d.student_id = u.id
        WHERE dc.user_id = $1
      `;
      
      const params = [userId];
      let paramCount = 1;

      // Add filters
      if (filters.role) {
        paramCount++;
        query += ` AND dc.role = $${paramCount}`;
        params.push(filters.role);
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

      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  // Check if user can access deadline
  static async canAccessDeadline(deadlineId, userId) {
    try {
      const query = `
        SELECT dc.*, d.student_id
        FROM deadline_collaborators dc
        JOIN deadlines d ON dc.deadline_id = d.id
        WHERE dc.deadline_id = $1 AND dc.user_id = $2
        UNION
        SELECT null as id, null as deadline_id, d.student_id as user_id, 'owner' as role, 
               true as can_edit, true as can_delete, null as joined_at, d.student_id
        FROM deadlines d
        WHERE d.id = $1 AND d.student_id = $2
      `;
      
      const result = await pool.query(query, [deadlineId, userId]);
      const access = result.rows[0];
      
      // Additional check: If user has 'copy_collaborator' role in JSONB but no actual DB permission,
      // they should NOT have access to the original deadline
      if (!access) {
        // Check if user is only listed as copy_collaborator in JSONB (tracking only)
        const deadlineQuery = 'SELECT collaborators FROM deadlines WHERE id = $1';
        const deadlineResult = await pool.query(deadlineQuery, [deadlineId]);
        
        if (deadlineResult.rows.length > 0) {
          const collaborators = deadlineResult.rows[0].collaborators || [];
          const copyCollaborator = collaborators.find(c => 
            c.user_id === userId && 
            (c.role === 'copy_collaborator' || c.has_copy === true)
          );
          
          if (copyCollaborator) {
            // User is only a copy collaborator, deny access to original
            console.log(`🚫 Access denied: User ${userId} is copy collaborator for deadline ${deadlineId}, not original collaborator`);
            return null;
          }
        }
      }
      
      return access;
    } catch (error) {
      throw error;
    }
  }

  // Check if user can edit deadline
  static async canEditDeadline(deadlineId, userId) {
    try {
      const access = await this.canAccessDeadline(deadlineId, userId);
      return access && (access.role === 'owner' || access.can_edit === true);
    } catch (error) {
      throw error;
    }
  }

  // Check if user can delete deadline
  static async canDeleteDeadline(deadlineId, userId) {
    try {
      const access = await this.canAccessDeadline(deadlineId, userId);
      return access && (access.role === 'owner' || access.can_delete === true);
    } catch (error) {
      throw error;
    }
  }

  // Get deadline with collaborators
  static async getDeadlineWithCollaborators(deadlineId, userId) {
    try {
      // First check if user can access the deadline
      const access = await this.canAccessDeadline(deadlineId, userId);
      if (!access) {
        throw new Error('Access denied to this deadline');
      }

      // Get deadline details
      const deadlineQuery = `
        SELECT d.*, u.username as owner_username, u.full_name as owner_name
        FROM deadlines d
        JOIN users u ON d.student_id = u.id
        WHERE d.id = $1
      `;
      
      const deadlineResult = await pool.query(deadlineQuery, [deadlineId]);
      const deadline = deadlineResult.rows[0];

      if (!deadline) {
        throw new Error('Deadline not found');
      }

      // Get collaborators
      const collaborators = await this.getCollaborators(deadlineId);

      return {
        ...deadline,
        collaborators,
        user_access: access
      };
    } catch (error) {
      throw error;
    }
  }

  // Get collaboration statistics
  static async getCollaborationStats(userId) {
    try {
      const query = `
        SELECT 
          COUNT(CASE WHEN dc.role = 'owner' THEN 1 END) as owned_deadlines,
          COUNT(CASE WHEN dc.role = 'collaborator' THEN 1 END) as collaborative_deadlines,
          COUNT(DISTINCT dc.deadline_id) as total_shared_deadlines,
          COUNT(DISTINCT CASE WHEN d.status = 'completed' THEN dc.deadline_id END) as completed_collaborations
        FROM deadline_collaborators dc
        JOIN deadlines d ON dc.deadline_id = d.id
        WHERE dc.user_id = $1
      `;
      
      const result = await pool.query(query, [userId]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Get all users who can receive notifications for a deadline
  static async getNotificationRecipients(deadlineId) {
    try {
      const query = `
        SELECT u.id as user_id, u.email, u.username, u.full_name, dc.role
        FROM deadline_collaborators dc
        JOIN users u ON dc.user_id = u.id
        WHERE dc.deadline_id = $1
        UNION
        SELECT u.id as user_id, u.email, u.username, u.full_name, 'owner' as role
        FROM deadlines d
        JOIN users u ON d.student_id = u.id
        WHERE d.id = $1
        ORDER BY role DESC, username
      `;
      
      const result = await pool.query(query, [deadlineId]);
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  // Transfer deadline ownership
  static async transferOwnership(deadlineId, currentOwnerId, newOwnerId) {
    try {
      // First verify current owner
      const ownershipQuery = `
        SELECT * FROM deadlines WHERE id = $1 AND student_id = $2
      `;
      
      const ownershipResult = await pool.query(ownershipQuery, [deadlineId, currentOwnerId]);
      if (ownershipResult.rows.length === 0) {
        throw new Error('Only the owner can transfer ownership');
      }

      // Update deadline owner
      const updateDeadlineQuery = `
        UPDATE deadlines 
        SET student_id = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
      
      await pool.query(updateDeadlineQuery, [newOwnerId, deadlineId]);

      // Update collaborator roles
      const updateRolesQuery = `
        UPDATE deadline_collaborators 
        SET role = CASE 
          WHEN user_id = $1 THEN 'owner'
          WHEN user_id = $2 THEN 'collaborator'
          ELSE role
        END
        WHERE deadline_id = $3
      `;
      
      await pool.query(updateRolesQuery, [newOwnerId, currentOwnerId, deadlineId]);

      return { success: true, message: 'Ownership transferred successfully' };
    } catch (error) {
      throw error;
    }
  }

  // Get all deadlines that a user can access (owned or collaborated)
  static async getUserAccessibleDeadlines(userId, filters = {}) {
    try {
      console.log('getUserAccessibleDeadlines called for user:', userId, 'with filters:', filters);
      
      // Build the base query to get all deadlines the user can access
      let query = `
        SELECT DISTINCT d.*, u.username, u.full_name as student_name,
               CASE 
                 WHEN d.student_id = $1 THEN 'owner'
                 WHEN dc.role IS NOT NULL THEN dc.role
                 ELSE NULL
               END as user_role,
               CASE 
                 WHEN d.student_id = $1 THEN true
                 WHEN dc.can_edit IS NOT NULL THEN dc.can_edit
                 ELSE false
               END as can_edit,
               CASE 
                 WHEN d.student_id = $1 THEN true
                 WHEN dc.can_delete IS NOT NULL THEN dc.can_delete
                 ELSE false
               END as can_delete
        FROM deadlines d
        LEFT JOIN users u ON d.student_id = u.id
        LEFT JOIN deadline_collaborators dc ON d.id = dc.deadline_id AND dc.user_id = $1
        WHERE (d.student_id = $1 OR dc.user_id IS NOT NULL)
      `;
      
      const params = [userId];
      let paramCount = 1;

      // Add filters
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

      console.log('Final SQL Query:', query);
      console.log('Query parameters:', params);

      const result = await pool.query(query, params);
      
      console.log(`getUserAccessibleDeadlines: Found ${result.rows.length} deadlines for user ${userId}`);
      
      // Get collaborators for each deadline
      const deadlinesWithCollaborators = await Promise.all(
        result.rows.map(async (deadline) => {
          try {
            const collaborators = await this.getCollaborators(deadline.id);
            return {
              ...deadline,
              collaborators
            };
          } catch (error) {
            console.error(`Error getting collaborators for deadline ${deadline.id}:`, error);
            return {
              ...deadline,
              collaborators: []
            };
          }
        })
      );
      
      if (deadlinesWithCollaborators.length > 0) {
        console.log('Sample deadline with collaborators:', {
          id: deadlinesWithCollaborators[0].id,
          title: deadlinesWithCollaborators[0].title,
          student_id: deadlinesWithCollaborators[0].student_id,
          user_role: deadlinesWithCollaborators[0].user_role,
          collaborators_count: deadlinesWithCollaborators[0].collaborators?.length || 0
        });
      }
      
      return deadlinesWithCollaborators;
    } catch (error) {
      throw error;
    }
  }

  // Get upcoming deadlines for a user (owned or collaborated)
  static async getUserUpcomingDeadlines(userId, days = 7) {
    try {
      const query = `
        SELECT DISTINCT d.*, u.username, u.full_name as student_name,
               CASE 
                 WHEN d.student_id = $1 THEN 'owner'
                 WHEN dc.role IS NOT NULL THEN dc.role
                 ELSE NULL
               END as user_role
        FROM deadlines d
        LEFT JOIN users u ON d.student_id = u.id
        LEFT JOIN deadline_collaborators dc ON d.id = dc.deadline_id AND dc.user_id = $1
        WHERE (d.student_id = $1 OR dc.user_id = $1)
          AND d.status IN ('pending', 'in_progress')
          AND d.due_date >= NOW()
          AND d.due_date <= NOW() + INTERVAL '1 day' * $2
        ORDER BY d.due_date ASC
      `;
      
      const result = await pool.query(query, [userId, days]);
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  // Get overdue deadlines for a user (owned or collaborated)
  static async getUserOverdueDeadlines(userId) {
    try {
      const query = `
        SELECT DISTINCT d.*, u.username, u.full_name as student_name,
               CASE 
                 WHEN d.student_id = $1 THEN 'owner'
                 WHEN dc.role IS NOT NULL THEN dc.role
                 ELSE NULL
               END as user_role
        FROM deadlines d
        LEFT JOIN users u ON d.student_id = u.id
        LEFT JOIN deadline_collaborators dc ON d.id = dc.deadline_id AND dc.user_id = $1
        WHERE (d.student_id = $1 OR dc.user_id = $1)
          AND d.status != 'completed'
          AND d.due_date < CURRENT_TIMESTAMP
        ORDER BY d.due_date ASC
      `;
      
      const result = await pool.query(query, [userId]);
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  // Get deadline statistics for a user (owned or collaborated)
  static async getUserDeadlineStats(userId) {
    try {
      const query = `
        SELECT 
          COUNT(DISTINCT d.id) as total,
          COUNT(DISTINCT CASE WHEN d.status = 'pending' THEN d.id END) as pending,
          COUNT(DISTINCT CASE WHEN d.status = 'in_progress' THEN d.id END) as in_progress,
          COUNT(DISTINCT CASE WHEN d.status = 'completed' THEN d.id END) as completed,
          COUNT(DISTINCT CASE WHEN d.due_date < CURRENT_TIMESTAMP AND d.status != 'completed' THEN d.id END) as overdue
        FROM deadlines d
        LEFT JOIN deadline_collaborators dc ON d.id = dc.deadline_id AND dc.user_id = $1
        WHERE (d.student_id = $1 OR dc.user_id = $1)
      `;
      
      const result = await pool.query(query, [userId]);
      const stats = result.rows[0];
      
      // Convert counts to numbers
      return {
        total: parseInt(stats.total) || 0,
        pending: parseInt(stats.pending) || 0,
        in_progress: parseInt(stats.in_progress) || 0,
        completed: parseInt(stats.completed) || 0,
        overdue: parseInt(stats.overdue) || 0
      };
    } catch (error) {
      throw error;
    }
  }

  // Create deadline copies for collaborators
  static async createCollaboratorCopies(originalDeadlineId, collaboratorUserIds, copyOptions = {}) {
    // Lazy load Deadline to avoid circular dependency
    if (!Deadline) {
      Deadline = require('./Deadline');
    }
    
    try {
      const copies = [];
      const { 
        createIndividualCopies = true, 
        titleSuffix = ' (My Copy)',
        maintainOriginalForOwner = true 
      } = copyOptions;

      if (!createIndividualCopies) {
        // Just add collaborators to original deadline (current behavior)
        for (const userId of collaboratorUserIds) {
          const collaborator = await this.addCollaborator(originalDeadlineId, userId, 'collaborator', {
            can_edit: true,
            can_delete: false
          });
          copies.push({ 
            user_id: userId, 
            deadline_id: originalDeadlineId, 
            is_copy: false, 
            collaborator 
          });
        }
        return copies;
      }

      // Get the current deadline to check if it's already a copy and find root owner
      const currentDeadline = await Deadline.findById(originalDeadlineId);
      if (!currentDeadline) {
        throw new Error('Source deadline not found');
      }

      // Find the root/original deadline and its owner
      let rootDeadlineId = originalDeadlineId;
      let rootOwnerId = currentDeadline.student_id;
      
      // If current deadline appears to be a copy (has "Copy" or "My Copy" in title), 
      // try to find the original deadline
      if (currentDeadline.title.includes('(Copy)') || currentDeadline.title.includes('(My Copy)')) {
        const baseTitle = currentDeadline.title.replace(/\s*\(My Copy\)|\s*\(Copy\)/g, '').trim();
        
        // Look for the original deadline with the base title
        // Try multiple strategies to find the original
        const originalQueries = [
          // Strategy 1: Find deadline with exact base title, different owner, created earlier
          `
            SELECT id, student_id, title, created_at
            FROM deadlines 
            WHERE title = $1 
            AND student_id != $2
            AND created_at < (SELECT created_at FROM deadlines WHERE id = $3)
            ORDER BY created_at ASC 
            LIMIT 1
          `,
          // Strategy 2: Find deadline with exact base title, different owner (any time)
          `
            SELECT id, student_id, title, created_at
            FROM deadlines 
            WHERE title = $1 
            AND student_id != $2
            ORDER BY created_at ASC 
            LIMIT 1
          `,
          // Strategy 3: Find any deadline with similar title pattern (without copy suffixes)
          `
            SELECT id, student_id, title, created_at
            FROM deadlines 
            WHERE TRIM(REGEXP_REPLACE(title, '\\s*\\(My Copy\\)|\\s*\\(Copy\\)', '', 'g')) = $1
            AND student_id != $2
            AND NOT (title LIKE '%(Copy)%' OR title LIKE '%(My Copy)%')
            ORDER BY created_at ASC 
            LIMIT 1
          `
        ];
        
        try {
          const pool = require('../config/db');
          
          for (let i = 0; i < originalQueries.length; i++) {
            const originalResult = await pool.query(originalQueries[i], [baseTitle, currentDeadline.student_id, originalDeadlineId]);
            if (originalResult.rows.length > 0) {
              rootDeadlineId = originalResult.rows[0].id;
              rootOwnerId = originalResult.rows[0].student_id;
              console.log(`📋 Found original deadline ${rootDeadlineId} owned by user ${rootOwnerId} for base title: "${baseTitle}" (Strategy ${i + 1})`);
              break;
            }
          }
        } catch (error) {
          console.warn('Could not find original deadline, proceeding with current as root:', error.message);
        }
      }

      // Create individual copies for each collaborator
      for (const userId of collaboratorUserIds) {
        try {
          // Check if this user is the original/root owner
          if (userId === rootOwnerId) {
            console.log(`� User ${userId} is the original owner of root deadline ${rootDeadlineId}`);
            
            // DENY the request - original owners cannot be added as collaborators to copies of their own deadlines
            if (rootDeadlineId !== originalDeadlineId) {
              console.log(`❌ DENIED: Cannot add original owner to a copy of their own deadline`);
              
              copies.push({
                user_id: userId,
                deadline_id: null,
                original_deadline_id: rootDeadlineId,
                is_copy: false,
                is_original_owner: true,
                error: 'Cannot add original owner to a copy of their own deadline',
                denied: true,
                message: `User ${userId} is the original owner of "${currentDeadline.title.replace(/\s*\(My Copy\)|\s*\(Copy\)/g, '').trim()}" and cannot be added as collaborator to copies of their own deadline.`
              });
              
              console.log(`🚫 Request denied: User ${userId} owns the original deadline and cannot collaborate on copies`);
              continue; // Skip to next user, don't process further
            } else {
              // This is the original deadline, allow adding collaborators
              await this.addCollaborator(originalDeadlineId, userId, 'collaborator', {
                can_edit: true,
                can_delete: false
              });

              copies.push({
                user_id: userId,
                deadline_id: originalDeadlineId,
                original_deadline_id: rootDeadlineId,
                is_copy: false,
                is_original_owner: true,
                message: 'Added original owner as collaborator to existing deadline'
              });
              
              console.log(`✅ Added original owner ${userId} as collaborator to original deadline ${originalDeadlineId}`);
            }
            
            console.log(`✅ Added original owner ${userId} as collaborator to deadline ${originalDeadlineId}`);
            continue;
          }

          // Create a copy of the deadline for this user
          const deadlineCopy = await Deadline.createCopy(originalDeadlineId, userId, {
            titleSuffix: titleSuffix,
            status: 'pending' // Reset status for new collaborator
          });

          // Add the user as owner of their copy
          await this.addCollaborator(deadlineCopy.id, userId, 'owner', {
            can_edit: true,
            can_delete: true
          });

          copies.push({
            user_id: userId,
            deadline_id: deadlineCopy.id,
            original_deadline_id: originalDeadlineId,
            is_copy: true,
            deadline: deadlineCopy
          });

          console.log(`✅ Created deadline copy ${deadlineCopy.id} for user ${userId}`);
        } catch (error) {
          console.error(`❌ Failed to create copy for user ${userId}:`, error);
          // Continue with other users even if one fails
          copies.push({
            user_id: userId,
            deadline_id: null,
            is_copy: false,
            error: error.message
          });
        }
      }

      return copies;
    } catch (error) {
      throw error;
    }
  }

  // Add collaborators with copy creation
  static async addCollaboratorsWithCopies(deadlineId, collaboratorUserIds, options = {}) {
    // Lazy load Deadline to avoid circular dependency
    if (!Deadline) {
      Deadline = require('./Deadline');
    }
    
    try {
      const {
        createCopies = true,
        copyOptions = {},
        notifyCollaborators = true
      } = options;

      if (createCopies) {
        // Create individual copies for each collaborator
        const copies = await this.createCollaboratorCopies(deadlineId, collaboratorUserIds, copyOptions);
        
        // Update the original deadline's collaborators JSONB field for tracking purposes
        // WITHOUT adding actual collaborator permissions (they don't get access to original)
        await this.updateOriginalDeadlineCollaboratorsList(deadlineId, collaboratorUserIds);
        
        // Send notifications about the new copies
        if (notifyCollaborators) {
          const InAppNotification = require('./InAppNotification');
          // Lazy load Deadline to avoid circular dependency
          if (!Deadline) {
            Deadline = require('./Deadline');
          }
          const originalDeadline = await Deadline.findById(deadlineId);
          
          for (const copy of copies) {
            if (copy.is_copy && copy.deadline) {
              try {
                await InAppNotification.create({
                  user_id: copy.user_id,
                  deadline_id: copy.deadline_id,
                  type: 'deadline_shared',
                  title: `New Deadline: ${copy.deadline.title}`,
                  message: `You've been added as a collaborator and received a copy of "${originalDeadline.title}". You can now track your progress independently.`,
                  data: {
                    original_deadline_id: deadlineId,
                    copy_deadline_id: copy.deadline_id,
                    action_type: 'deadline_copy_created'
                  },
                  priority: 'normal',
                  action_url: `/deadlines/${copy.deadline_id}`
                });
                console.log(`📱 Sent notification to user ${copy.user_id} about deadline copy`);
              } catch (notificationError) {
                console.error(`❌ Failed to send notification to user ${copy.user_id}:`, notificationError);
              }
            }
          }
        }

        return copies;
      } else {
        // Use traditional collaborator approach
        const collaborators = [];
        for (const userId of collaboratorUserIds) {
          const collaborator = await this.addCollaborator(deadlineId, userId, 'collaborator', {
            can_edit: true,
            can_delete: false
          });
          collaborators.push(collaborator);
        }
        return collaborators;
      }
    } catch (error) {
      throw error;
    }
  }

  // Sync collaborators from deadline_collaborators table to deadline.collaborators field
  static async syncCollaboratorsToDeadline(deadlineId) {
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
      const updateQuery = `
        UPDATE deadlines 
        SET collaborators = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, title
      `;
      
      await pool.query(updateQuery, [deadlineId, JSON.stringify(collaborators)]);
      
      console.log(`📊 Synced ${collaborators.length} collaborators for deadline ${deadlineId}`);
      return collaborators;
    } catch (error) {
      console.error('Error syncing collaborators to deadline:', error);
      throw error;
    }
  }

  // Update original deadline's collaborators JSONB field for tracking without granting access
  static async updateOriginalDeadlineCollaboratorsList(deadlineId, newCollaboratorUserIds) {
    try {
      // Get current deadline
      const deadlineQuery = 'SELECT collaborators FROM deadlines WHERE id = $1';
      const deadlineResult = await pool.query(deadlineQuery, [deadlineId]);
      
      if (!deadlineResult.rows.length) {
        throw new Error('Deadline not found');
      }

      let currentCollaborators = deadlineResult.rows[0].collaborators || [];
      
      // Get user details for new collaborators
      if (newCollaboratorUserIds.length > 0) {
        const usersQuery = `
          SELECT id, username, full_name, email
          FROM users 
          WHERE id = ANY($1)
        `;
        const usersResult = await pool.query(usersQuery, [newCollaboratorUserIds]);
        
        // Add new collaborators to the list (without actual database permissions)
        for (const user of usersResult.rows) {
          // Check if user is already in the collaborators list
          const existingIndex = currentCollaborators.findIndex(c => c.user_id === user.id);
          
          if (existingIndex === -1) {
            // Add as tracking-only collaborator
            currentCollaborators.push({
              user_id: user.id,
              username: user.username,
              full_name: user.full_name,
              email: user.email,
              role: 'copy_collaborator', // Special role indicating they have a copy, not direct access
              can_edit: false,
              can_delete: false,
              joined_at: new Date().toISOString(),
              has_copy: true // Flag to indicate this is for tracking only
            });
          }
        }
      }

      // Update the deadline's collaborators field
      const updateQuery = `
        UPDATE deadlines 
        SET collaborators = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;
      
      await pool.query(updateQuery, [deadlineId, JSON.stringify(currentCollaborators)]);
      
      console.log(`📊 Updated collaborators list for deadline ${deadlineId} - added ${newCollaboratorUserIds.length} copy collaborators`);
      return currentCollaborators;
    } catch (error) {
      console.error('Error updating original deadline collaborators list:', error);
      throw error;
    }
  }
}

module.exports = DeadlineCollaborator;