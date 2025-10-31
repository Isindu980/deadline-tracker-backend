const express = require('express');
const { 
  getAllDeadlines, 
  getDeadlineById, 
  createDeadline, 
  updateDeadline, 
  updateDeadlineStatus, 
  deleteDeadline, 
  getUpcomingDeadlines, 
  getOverdueDeadlines,
  getDeadlineStats,
  getDeadlinesByStudentId,
  addCollaboratorsToDeadline
} = require('../controllers/deadlineController');
const auth = require('../middleware/auth');

const router = express.Router();

// All routes require authentication

// GET /api/deadlines - Get all deadlines with filtering and pagination
router.get('/', auth, getAllDeadlines);

// GET /api/deadlines/upcoming - Get upcoming deadlines
router.get('/upcoming', auth, getUpcomingDeadlines);

// GET /api/deadlines/overdue - Get overdue deadlines
router.get('/overdue', auth, getOverdueDeadlines);

// GET /api/deadlines/stats - Get deadline statistics
router.get('/stats', auth, getDeadlineStats);

// GET /api/deadlines/student/:student_id - Get deadlines by student ID
router.get('/student/:student_id', auth, getDeadlinesByStudentId);

// GET /api/deadlines/:id - Get deadline by ID
router.get('/:id', auth, getDeadlineById);

// GET /api/deadlines/:id/collaborators - Get collaborators for a specific deadline
router.get('/:id/collaborators', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid deadline ID is required'
      });
    }

    const DeadlineCollaborator = require('../models/DeadlineCollaborator');
    
    // Check if user has access to this deadline
    const access = await DeadlineCollaborator.canAccessDeadline(parseInt(id), userId);
    if (!access) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this deadline'
      });
    }

    // Get collaborators
    const collaborators = await DeadlineCollaborator.getCollaborators(parseInt(id));
    
    // Enhanced collaborator data for modal
    const collaboratorData = {
      deadline_id: parseInt(id),
      collaborators: collaborators,
      collaborator_count: collaborators.length,
      collaborator_summary: {
        owners: collaborators.filter(c => c.role === 'owner').length,
        collaborators: collaborators.filter(c => c.role === 'collaborator').length,
        total: collaborators.length
      },
      // Group by role for easier frontend handling
      by_role: {
        owners: collaborators.filter(c => c.role === 'owner'),
        collaborators: collaborators.filter(c => c.role === 'collaborator')
      },
      // List of user IDs for easy checking
      user_ids: collaborators.map(c => c.user_id),
      // Current user's role and permissions
      current_user: {
        role: access.role,
        can_edit: access.can_edit,
        can_delete: access.can_delete,
        can_manage_collaborators: access.role === 'owner' || access.can_edit
      }
    };

    res.json({
      success: true,
      message: `Found ${collaborators.length} collaborators`,
      data: collaboratorData
    });

  } catch (error) {
    console.error('Get deadline collaborators error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// POST /api/deadlines - Create new deadline
router.post('/', auth, createDeadline);

// POST /api/deadlines/test-simple - Simple deadline creation for testing
router.post('/test-simple', auth, async (req, res) => {
  try {
    console.log('🧪 Simple deadline test started');
    console.log('Request body:', req.body);
    
    const { student_id, title, description, due_date } = req.body;
    
    // Basic validation
    if (!student_id || !title || !due_date) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: student_id, title, due_date'
      });
    }
    
    // Import models
    const Deadline = require('../models/Deadline');
    const User = require('../models/User');
    
    // Check if user exists
    const user = await User.findById(student_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Create basic deadline
    const deadlineData = {
      student_id: parseInt(student_id),
      title: title.trim(),
      description: description ? description.trim() : null,
      due_date,
      priority: 'medium',
      status: 'pending'
    };
    
    console.log('Creating deadline with data:', deadlineData);
    const deadline = await Deadline.create(deadlineData);
    console.log('✅ Deadline created successfully:', deadline.id);
    
    res.status(201).json({
      success: true,
      message: 'Simple deadline created successfully',
      data: { deadline }
    });
    
  } catch (error) {
    console.error('❌ Simple deadline test error:', error);
    res.status(500).json({
      success: false,
      message: 'Test failed',
      error: error.message
    });
  }
});

// POST /api/deadlines/test-collaborator - Test adding collaborator
router.post('/test-collaborator', auth, async (req, res) => {
  try {
    console.log('🧪 Collaborator test started');
    
    const { deadline_id, user_id } = req.body;
    
    if (!deadline_id || !user_id) {
      return res.status(400).json({
        success: false,
        message: 'Missing deadline_id or user_id'
      });
    }
    
    const DeadlineCollaborator = require('../models/DeadlineCollaborator');
    
    // Test table creation first
    console.log('Creating deadline_collaborators table if not exists...');
    await DeadlineCollaborator.createTable();
    
    // Test adding collaborator
    console.log(`Adding user ${user_id} as owner to deadline ${deadline_id}`);
    const collaborator = await DeadlineCollaborator.addCollaborator(deadline_id, user_id, 'owner', {
      can_edit: true,
      can_delete: true
    });
    
    console.log('✅ Collaborator added successfully:', collaborator);
    
    res.json({
      success: true,
      message: 'Collaborator test passed',
      data: { collaborator }
    });
    
  } catch (error) {
    console.error('❌ Collaborator test error:', error);
    res.status(500).json({
      success: false,
      message: 'Collaborator test failed',
      error: error.message
    });
  }
});

// POST /api/deadlines/init-tables - Initialize required tables
router.post('/init-tables', auth, async (req, res) => {
  try {
    console.log('🧪 Initializing database tables...');
    
    const Deadline = require('../models/Deadline');
    const DeadlineCollaborator = require('../models/DeadlineCollaborator');
    const InAppNotification = require('../models/InAppNotification');
    
    // Create tables
    await Deadline.createTable();
    await DeadlineCollaborator.createTable();
    await InAppNotification.createTable();
    
    console.log('✅ All tables initialized successfully');
    
    res.json({
      success: true,
      message: 'Database tables initialized successfully'
    });
    
  } catch (error) {
    console.error('❌ Table initialization error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize tables',
      error: error.message
    });
  }
});

// PUT /api/deadlines/:id - Update deadline
router.put('/:id', auth, updateDeadline);

// PATCH /api/deadlines/:id/status - Update deadline status only
router.patch('/:id/status', auth, updateDeadlineStatus);

// DELETE /api/deadlines/:id - Delete deadline
router.delete('/:id', auth, deleteDeadline);

// POST /api/deadlines/:id/collaborators - Add collaborators to existing deadline
router.post('/:id/collaborators', auth, addCollaboratorsToDeadline);

// POST /api/deadlines/debug-collaborators - Debug collaborator functionality
router.post('/debug-collaborators', auth, async (req, res) => {
  try {
    const { deadline_id, user_id } = req.body;
    
    if (!deadline_id || !user_id) {
      return res.status(400).json({
        success: false,
        message: 'deadline_id and user_id are required'
      });
    }

    console.log('🔍 Starting collaborator debug for deadline:', deadline_id, 'user:', user_id);
    
    const DeadlineCollaborator = require('../models/DeadlineCollaborator');
    const pool = require('../config/db');
    
    // Step 1: Check if deadline_collaborators table exists
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'deadline_collaborators'
    `);
    console.log('Table exists:', tableCheck.rows.length > 0);
    
    // Step 2: Check table structure (only if table exists)
    let structureCheck = { rows: [] };
    if (tableCheck.rows.length > 0) {
      structureCheck = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'deadline_collaborators'
        ORDER BY ordinal_position
      `);
      console.log('Table structure:', structureCheck.rows);
    }
    
    // Step 3: Try to add collaborator
    console.log('Attempting to add collaborator...');
    const addResult = await DeadlineCollaborator.addCollaborator(deadline_id, user_id, 'owner', {
      can_edit: true,
      can_delete: true
    });
    console.log('Add collaborator result:', addResult);
    
    // Step 4: Verify collaborator was added
    console.log('Verifying collaborator was added...');
    const verifyResult = await DeadlineCollaborator.getCollaboratorRole(deadline_id, user_id);
    console.log('Verify result:', verifyResult);
    
    // Step 5: Get all collaborators for deadline
    console.log('Getting all collaborators...');
    const allCollaborators = await DeadlineCollaborator.getCollaborators(deadline_id);
    console.log('All collaborators:', allCollaborators);
    
    // Step 6: Raw query check
    console.log('Raw query check...');
    const rawQuery = await pool.query('SELECT * FROM deadline_collaborators WHERE deadline_id = $1', [deadline_id]);
    console.log('Raw query result:', rawQuery.rows);
    
    res.json({
      success: true,
      message: 'Collaborator debug completed',
      data: {
        table_exists: tableCheck.rows.length > 0,
        table_structure: structureCheck.rows,
        add_result: addResult,
        verify_result: verifyResult,
        all_collaborators: allCollaborators,
        raw_query_result: rawQuery.rows
      }
    });
    
  } catch (error) {
    console.error('❌ Collaborator debug error:', error);
    res.status(500).json({
      success: false,
      message: 'Debug failed',
      error: error.message,
      stack: error.stack
    });
  }
});

// POST /api/deadlines/fix-missing-owners - Fix deadlines missing owner collaborators
router.post('/fix-missing-owners', auth, async (req, res) => {
  try {
    console.log('🔧 Starting to fix missing owner collaborators...');
    
    const DeadlineCollaborator = require('../models/DeadlineCollaborator');
    const Deadline = require('../models/Deadline');
    const pool = require('../config/db');
    
    // Get all deadlines
    const allDeadlines = await pool.query('SELECT id, student_id, title FROM deadlines ORDER BY id');
    console.log(`Found ${allDeadlines.rows.length} total deadlines`);
    
    const results = {
      processed: 0,
      added: 0,
      already_exists: 0,
      errors: []
    };
    
    for (const deadline of allDeadlines.rows) {
      try {
        results.processed++;
        console.log(`Processing deadline ${deadline.id}: "${deadline.title}" (owner: ${deadline.student_id})`);
        
        // Check if owner is already a collaborator
        const existingCollab = await DeadlineCollaborator.getCollaboratorRole(deadline.id, deadline.student_id);
        
        if (existingCollab) {
          console.log(`  ✅ Owner already exists as collaborator (${existingCollab.role})`);
          results.already_exists++;
        } else {
          console.log(`  ➕ Adding owner as collaborator...`);
          
          // Add owner as collaborator
          const newCollab = await DeadlineCollaborator.addCollaborator(
            deadline.id, 
            deadline.student_id, 
            'owner', 
            {
              can_edit: true,
              can_delete: true
            }
          );
          
          console.log(`  ✅ Successfully added owner as collaborator:`, newCollab);
          results.added++;
        }
        
      } catch (error) {
        console.error(`  ❌ Error processing deadline ${deadline.id}:`, error.message);
        results.errors.push({
          deadline_id: deadline.id,
          error: error.message
        });
      }
    }
    
    console.log('🎉 Fix operation completed:', results);
    
    res.json({
      success: true,
      message: 'Fix operation completed',
      data: results
    });
    
  } catch (error) {
    console.error('❌ Fix operation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Fix operation failed',
      error: error.message
    });
  }
});

// POST /api/deadlines/fix-database-schema - Fix missing database columns
router.post('/fix-database-schema', auth, async (req, res) => {
  try {
    console.log('🔧 Starting database schema fix...');
    
    const pool = require('../config/db');
    const results = {
      columns_added: [],
      columns_already_exist: [],
      errors: []
    };
    
    // Check and add missing notifications_sent column
    try {
      console.log('Checking notifications_sent column...');
      
      // Check if column exists
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'deadlines' AND column_name = 'notifications_sent'
      `);
      
      if (columnCheck.rows.length === 0) {
        console.log('Adding notifications_sent column...');
        await pool.query(`
          ALTER TABLE deadlines 
          ADD COLUMN notifications_sent JSONB DEFAULT '{}'
        `);
        results.columns_added.push('notifications_sent');
        console.log('✅ Added notifications_sent column');
      } else {
        results.columns_already_exist.push('notifications_sent');
        console.log('✅ notifications_sent column already exists');
      }
      
    } catch (error) {
      console.error('❌ Error with notifications_sent column:', error);
      results.errors.push({
        column: 'notifications_sent',
        error: error.message
      });
    }
    
    // Check and add other potentially missing columns
    const columnsToCheck = [
      {
        name: 'completed_at',
        definition: 'TIMESTAMP'
      },
      {
        name: 'updated_at', 
        definition: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
      }
    ];
    
    for (const col of columnsToCheck) {
      try {
        console.log(`Checking ${col.name} column...`);
        
        const columnCheck = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'deadlines' AND column_name = $1
        `, [col.name]);
        
        if (columnCheck.rows.length === 0) {
          console.log(`Adding ${col.name} column...`);
          await pool.query(`ALTER TABLE deadlines ADD COLUMN ${col.name} ${col.definition}`);
          results.columns_added.push(col.name);
          console.log(`✅ Added ${col.name} column`);
        } else {
          results.columns_already_exist.push(col.name);
          console.log(`✅ ${col.name} column already exists`);
        }
        
      } catch (error) {
        console.error(`❌ Error with ${col.name} column:`, error);
        results.errors.push({
          column: col.name,
          error: error.message
        });
      }
    }
    
    // Show final table structure
    console.log('Final table structure:');
    const finalStructure = await pool.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'deadlines'
      ORDER BY ordinal_position
    `);
    
    console.log('Deadlines table structure:', finalStructure.rows);
    
    res.json({
      success: true,
      message: 'Database schema fix completed',
      data: {
        ...results,
        final_structure: finalStructure.rows
      }
    });
    
  } catch (error) {
    console.error('❌ Schema fix failed:', error);
    res.status(500).json({
      success: false,
      message: 'Schema fix failed',
      error: error.message
    });
  }
});

// POST /api/deadlines/migrate-collaborators - Add collaborators field and sync data
router.post('/migrate-collaborators', auth, async (req, res) => {
  try {
    console.log('🔄 Starting collaborators migration...');
    
    const pool = require('../config/db');
    const DeadlineCollaborator = require('../models/DeadlineCollaborator');
    
    const results = {
      column_added: false,
      deadlines_synced: 0,
      errors: []
    };
    
    // Step 1: Add collaborators column if it doesn't exist
    try {
      console.log('Checking if collaborators column exists...');
      
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'deadlines' AND column_name = 'collaborators'
      `);
      
      if (columnCheck.rows.length === 0) {
        console.log('Adding collaborators column...');
        await pool.query(`
          ALTER TABLE deadlines 
          ADD COLUMN collaborators JSONB DEFAULT '[]'
        `);
        results.column_added = true;
        console.log('✅ Added collaborators column');
      } else {
        console.log('✅ Collaborators column already exists');
      }
      
    } catch (error) {
      console.error('❌ Error adding collaborators column:', error);
      results.errors.push({
        step: 'add_column',
        error: error.message
      });
    }
    
    // Step 2: Sync all existing deadlines
    try {
      console.log('Getting all deadlines to sync...');
      
      const allDeadlines = await pool.query('SELECT id, title FROM deadlines ORDER BY id');
      console.log(`Found ${allDeadlines.rows.length} deadlines to sync`);
      
      for (const deadline of allDeadlines.rows) {
        try {
          console.log(`Syncing deadline ${deadline.id}: "${deadline.title}"`);
          await DeadlineCollaborator.syncCollaboratorsToDeadline(deadline.id);
          results.deadlines_synced++;
        } catch (syncError) {
          console.error(`Error syncing deadline ${deadline.id}:`, syncError.message);
          results.errors.push({
            step: 'sync_deadline',
            deadline_id: deadline.id,
            error: syncError.message
          });
        }
      }
      
    } catch (error) {
      console.error('❌ Error during sync process:', error);
      results.errors.push({
        step: 'sync_process',
        error: error.message
      });
    }
    
    // Step 3: Verify the migration
    try {
      console.log('Verifying migration...');
      
      const verifyQuery = await pool.query(`
        SELECT id, title, 
               CASE 
                 WHEN collaborators IS NULL THEN 'null'
                 ELSE jsonb_array_length(collaborators)::text
               END as collaborator_count
        FROM deadlines 
        ORDER BY id 
        LIMIT 5
      `);
      
      console.log('Sample deadline collaborator counts:', verifyQuery.rows);
      
    } catch (error) {
      console.error('❌ Error during verification:', error);
      results.errors.push({
        step: 'verification',
        error: error.message
      });
    }
    
    console.log('🎉 Migration completed:', results);
    
    res.json({
      success: true,
      message: 'Collaborators migration completed',
      data: results
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    res.status(500).json({
      success: false,
      message: 'Migration failed',
      error: error.message
    });
  }
});

module.exports = router;