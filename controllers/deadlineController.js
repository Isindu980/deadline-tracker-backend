const Deadline = require('../models/Deadline');
const User = require('../models/User');
const DeadlineCollaborator = require('../models/DeadlineCollaborator');
const Friend = require('../models/Friend');
const pool = require('../config/db');

// Validation helper functions
const validateDateFormat = (dateString) => {
  // Accept various datetime formats
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  const standardRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  const datetimeLocalRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/; // From datetime-local input
  const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
  
  return isoRegex.test(dateString) || standardRegex.test(dateString) || 
         datetimeLocalRegex.test(dateString) || dateOnlyRegex.test(dateString);
};

const validatePriority = (priority) => {
  return ['low', 'medium', 'high', 'urgent'].includes(priority);
};

const validateStatus = (status) => {
  return ['pending', 'in_progress', 'completed', 'overdue'].includes(status);
};

const validateTitle = (title) => {
  return title && title.trim().length >= 1 && title.length <= 255;
};

const validateDescription = (description) => {
  return !description || description.length <= 1000;
};

// Get all deadlines with filtering and pagination
const getAllDeadlines = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      priority, 
      search, 
      sortBy = 'due_date', 
      sortOrder = 'ASC',
      category,
      subject,
      
    } = req.query;

    // Validation
    const errors = [];
    
    if (page && (isNaN(parseInt(page)) || parseInt(page) < 1)) {
      errors.push('Page must be a positive integer');
    }
    
    if (limit && (isNaN(parseInt(limit)) || parseInt(limit) < 1 || parseInt(limit) > 100)) {
      errors.push('Limit must be between 1 and 100');
    }
    
    if (status && !validateStatus(status)) {
      errors.push('Invalid status value');
    }
    
    if (priority && !validatePriority(priority)) {
      errors.push('Invalid priority value');
    }

    const validSortFields = ['id', 'title', 'due_date', 'status', 'priority', 'created_at'];
    if (sortBy && !validSortFields.includes(sortBy)) {
      errors.push('Invalid sort field');
    }

    if (sortOrder && !['ASC', 'DESC'].includes(sortOrder.toUpperCase())) {
      errors.push('Sort order must be ASC or DESC');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const filters = {
      limit: parseInt(limit),
      offset,
      sortBy,
      sortOrder: sortOrder.toUpperCase()
    };

    if (status) filters.status = status;
    if (priority) filters.priority = priority;
    // Remove student_id filter since we're now using user authorization
    if (search) filters.search = search;
    if (category) filters.category = category;
    if (subject) filters.subject = subject;

    // Get user ID from authenticated user
    const userId = req.user.userId;

    // Use DeadlineCollaborator to get only user-accessible deadlines
    const deadlines = await DeadlineCollaborator.getUserAccessibleDeadlines(userId, filters);
    console.log('Fetched user-accessible deadlines:', deadlines?.length || 0, 'for user:', userId);
    
    // Debug: Log collaborator information for each deadline
    if (deadlines && deadlines.length > 0) {
      deadlines.forEach((deadline, index) => {
        console.log(`Deadline ${index + 1}: ID=${deadline.id}, Title="${deadline.title}", Collaborators=${deadline.collaborators?.length || 0}`);
        if (deadline.collaborators && deadline.collaborators.length > 0) {
          deadline.collaborators.forEach((collab, collabIndex) => {
            console.log(`  Collaborator ${collabIndex + 1}: ${collab.username} (${collab.role})`);
          });
        }
      });
    }

    res.json({
      success: true,
      data: {
        deadlines,
        pagination: {
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get all deadlines error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      query: req.query
    });
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single deadline by ID
const getDeadlineById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id)) || parseInt(id) < 1) {
      return res.status(400).json({
        success: false,
        message: 'Valid deadline ID is required'
      });
    }

    // Get user ID from auth middleware
    const userId = req.user.userId;

    // Use DeadlineCollaborator method to get deadline with collaborators
    try {
      const deadline = await DeadlineCollaborator.getDeadlineWithCollaborators(parseInt(id), userId);
      
      // Enhanced collaborator information for frontend modal
      const enhancedDeadline = {
        ...deadline,
        // Ensure collaborators array exists and is properly formatted
        collaborators: deadline.collaborators || [],
        // Add convenient fields for frontend
        collaborator_count: deadline.collaborators ? deadline.collaborators.length : 0,
        collaborator_ids: deadline.collaborators ? deadline.collaborators.map(c => c.user_id) : [],
        // Separate collaborators by role for easier access
        owner_collaborators: deadline.collaborators ? deadline.collaborators.filter(c => c.role === 'owner') : [],
        regular_collaborators: deadline.collaborators ? deadline.collaborators.filter(c => c.role === 'collaborator') : [],
        // Check if current user can manage collaborators
        can_manage_collaborators: deadline.user_access && (deadline.user_access.role === 'owner' || deadline.user_access.can_edit)
      };
      
      console.log(`📋 Deadline ${id} retrieved with ${enhancedDeadline.collaborator_count} collaborators`);
      if (enhancedDeadline.collaborators.length > 0) {
        console.log('👥 Collaborators:', enhancedDeadline.collaborators.map(c => `${c.username} (${c.role})`).join(', '));
      }
      
      res.json({
        success: true,
        data: {
          deadline: enhancedDeadline
        }
      });
    } catch (accessError) {
      if (accessError.message === 'Access denied to this deadline') {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this deadline'
        });
      }
      if (accessError.message === 'Deadline not found') {
        return res.status(404).json({
          success: false,
          message: 'Deadline not found'
        });
      }
      throw accessError;
    }

  } catch (error) {
    console.error('Get deadline by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Create a new deadline
const createDeadline = async (req, res) => {
  try {
    console.log('Create deadline request body:', req.body);
    console.log('Original due_date received:', req.body.due_date);
    console.log('Authenticated user:', req.user);
    
    console.log('🚀 Starting deadline creation process...');
    
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
      notes,
      collaborators = [] // Array of user IDs to add as collaborators
    } = req.body;

    // Validation
    const errors = [];

    if (!student_id || isNaN(parseInt(student_id)) || parseInt(student_id) < 1) {
      errors.push('Valid student ID is required');
    }

    if (!validateTitle(title)) {
      errors.push('Title is required and must be between 1 and 255 characters');
    }

    if (!validateDescription(description)) {
      errors.push('Description must be less than 1000 characters');
    }

    if (!due_date) {
      errors.push('Due date is required');
    } else if (!validateDateFormat(due_date)) {
      errors.push('Due date must be in valid format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)');
    }
    // Removed future date validation - allow any date (past, present, or future)

    if (!validatePriority(priority)) {
      errors.push('Priority must be: low, medium, high, or urgent');
    }

    if (!validateStatus(status)) {
      errors.push('Status must be: pending, in_progress, completed, or overdue');
    }

    if (category && (category.length > 50)) {
      errors.push('Category must be less than 50 characters');
    }

    if (subject && (subject.length > 100)) {
      errors.push('Subject must be less than 100 characters');
    }

    if (estimated_hours && (isNaN(parseInt(estimated_hours)) || parseInt(estimated_hours) < 0)) {
      errors.push('Estimated hours must be a positive number');
    }

    if (notes && notes.length > 1000) {
      errors.push('Notes must be less than 1000 characters');
    }

    // Validate collaborators array - simplified for debugging
    if (collaborators && !Array.isArray(collaborators)) {
      errors.push('Collaborators must be an array of user IDs');
    }

    if (errors.length > 0) {
      console.log('Validation errors:', errors);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Check if student exists - temporarily commented for debugging
    // const student = await User.findById(student_id);
    // if (!student) {
    //   return res.status(404).json({
    //     success: false,
    //     message: 'Student not found'
    //   });
    // }

    // Process the due_date - preserve user's intended time
    let formattedDueDate = due_date;
    if (due_date) {
      console.log('Processing due_date:', due_date);
      
      // Handle different date formats
      if (/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
        // Date only format - add end of day time
        formattedDueDate = due_date + ' 23:59:59';
        console.log('Added time to date-only input:', formattedDueDate);
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(due_date)) {
        // Datetime-local format (YYYY-MM-DDTHH:mm) - add seconds
        formattedDueDate = due_date + ':00';
        console.log('Added seconds to datetime-local input:', formattedDueDate);
      }
      
      console.log('Final formatted due_date:', formattedDueDate);
      // PostgreSQL can handle ISO strings and standard datetime formats
      // No need to convert timezone - keep it as user intended
      console.log('Final formatted due_date:', formattedDueDate);
    }

    // Create deadline
    const deadlineData = {
      student_id: parseInt(student_id),
      title: title.trim(),
      description: description ? description.trim() : null,
      due_date: formattedDueDate,
      priority,
      status,
      category: category ? category.trim() : null,
      subject: subject ? subject.trim() : null,
      estimated_hours: estimated_hours ? parseInt(estimated_hours) : null,
      notes: notes ? notes.trim() : null
    };

    console.log('Creating deadline with data:', deadlineData);
    
    let deadline;
    try {
      console.log('🔍 About to call Deadline.create...');
      deadline = await Deadline.create(deadlineData);
      console.log('✅ Deadline.create completed successfully');
      console.log('📋 Created deadline object:', JSON.stringify(deadline, null, 2));
      
      // Verify the deadline was actually stored by checking the database
      console.log('🔍 Verifying deadline was stored in database...');
      const verifyQuery = 'SELECT * FROM deadlines WHERE id = $1';
      const pool = require('../config/db');
      const verifyResult = await pool.query(verifyQuery, [deadline.id]);
      
      if (verifyResult.rows.length > 0) {
        console.log('✅ Deadline verified in database:', verifyResult.rows[0].title);
      } else {
        console.log('❌ Deadline NOT found in database after creation!');
      }
      
    } catch (createError) {
      console.error('❌ Error in Deadline.create:', createError);
      console.error('Error stack:', createError.stack);
      throw createError;
    }

    // Add owner as collaborator to ensure they appear in collaborator lists
    console.log('Adding owner as collaborator...');
    console.log(`Deadline ID: ${deadline.id}, Owner ID: ${deadline.student_id}`);
    
    try {
      const ownerCollab = await DeadlineCollaborator.addCollaborator(deadline.id, deadline.student_id, 'owner', {
        can_edit: true,
        can_delete: true
      });
      console.log('✅ Owner added as collaborator successfully:', ownerCollab);
      
      // Verify the collaborator was actually added
      const verifyCollab = await DeadlineCollaborator.getCollaboratorRole(deadline.id, deadline.student_id);
      console.log('🔍 Verification - Owner collaborator record:', verifyCollab);
      
    } catch (collabError) {
      console.error('⚠️ Error adding owner as collaborator:', collabError);
      console.error('Error details:', {
        message: collabError.message,
        stack: collabError.stack,
        deadlineId: deadline.id,
        ownerId: deadline.student_id
      });
      // Continue anyway since the deadline was created successfully
    }
    
    // Get the created deadline with collaborators
    let deadlineWithCollaborators;
    try {
      console.log('🔍 Retrieving deadline with collaborators...');
      deadlineWithCollaborators = await DeadlineCollaborator.getDeadlineWithCollaborators(deadline.id, deadline.student_id);
      console.log('✅ Retrieved deadline with collaborators');
      console.log(`📋 Deadline collaborators count: ${deadlineWithCollaborators.collaborators?.length || 0}`);
      
      if (deadlineWithCollaborators.collaborators && deadlineWithCollaborators.collaborators.length > 0) {
        console.log('👥 Collaborators list:');
        deadlineWithCollaborators.collaborators.forEach((collab, index) => {
          console.log(`  ${index + 1}. ${collab.username} (${collab.role}) - Edit: ${collab.can_edit}, Delete: ${collab.can_delete}`);
        });
      } else {
        console.log('⚠️ No collaborators found for deadline');
        
        // Manual check for collaborators
        console.log('🔍 Manual collaborator check...');
        const manualCollabs = await DeadlineCollaborator.getCollaborators(deadline.id);
        console.log('Manual collaborator query result:', manualCollabs);
      }
      
    } catch (retrieveError) {
      console.error('⚠️ Error retrieving deadline with collaborators:', retrieveError);
      console.error('Retrieve error details:', {
        message: retrieveError.message,
        stack: retrieveError.stack
      });
      // Fallback to basic deadline object
      deadlineWithCollaborators = deadline;
    }
    
    res.status(201).json({
      success: true,
      message: 'Deadline created successfully',
      data: {
        deadline: deadlineWithCollaborators,
        added_collaborators: []
      }
    });

  } catch (error) {
    console.error('Create deadline error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      requestBody: req.body
    });
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update an existing deadline
const updateDeadline = async (req, res) => {
  try {
    const { id } = req.params;
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
    } = req.body;

    // Debug logging
    console.log('Update deadline request:', {
      id,
      body: req.body,
      due_date,
      title,
      priority,
      status
    });

    // Validation
    const errors = [];

    if (!id || isNaN(parseInt(id)) || parseInt(id) < 1) {
      errors.push('Valid deadline ID is required');
    }

    if (title !== undefined && !validateTitle(title)) {
      errors.push('Title must be between 1 and 255 characters');
    }

    if (description !== undefined && !validateDescription(description)) {
      errors.push('Description must be less than 1000 characters');
    }

    if (due_date !== undefined) {
      if (!validateDateFormat(due_date)) {
        errors.push('Due date must be in valid format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)');
      }
      // For updates, we don't require the date to be in the future
      // Users should be able to set any date (past, present, or future)
    }

    if (priority !== undefined && !validatePriority(priority)) {
      errors.push('Priority must be: low, medium, high, or urgent');
    }

    if (status !== undefined && !validateStatus(status)) {
      errors.push('Status must be: pending, in_progress, completed, or overdue');
    }

    if (estimated_hours !== undefined && estimated_hours !== null && estimated_hours !== '') {
      const estimatedHoursNum = parseInt(estimated_hours);
      if (isNaN(estimatedHoursNum) || estimatedHoursNum < 0) {
        errors.push('Estimated hours must be a positive number');
      }
    }

    if (actual_hours !== undefined && actual_hours !== null && actual_hours !== '') {
      const actualHoursNum = parseInt(actual_hours);
      if (isNaN(actualHoursNum) || actualHoursNum < 0) {
        errors.push('Actual hours must be a positive number');
      }
    }

    if (completion_percentage !== undefined && completion_percentage !== null && completion_percentage !== '') {
      const completionNum = parseInt(completion_percentage);
      if (isNaN(completionNum) || completionNum < 0 || completionNum > 100) {
        errors.push('Completion percentage must be between 0 and 100');
      }
    }

    if (category !== undefined && category !== null && category.length > 50) {
      errors.push('Category must be less than 50 characters');
    }

    if (subject !== undefined && subject !== null && subject.length > 100) {
      errors.push('Subject must be less than 100 characters');
    }

    if (notes !== undefined && notes !== null && notes.length > 1000) {
      errors.push('Notes must be less than 1000 characters');
    }

    if (errors.length > 0) {
      console.log('Validation errors in update:', errors);
      console.log('Request data:', { title, description, due_date, priority, status, category, subject, estimated_hours, actual_hours, completion_percentage, notes });
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Check if deadline exists
    const existingDeadline = await Deadline.findById(parseInt(id));
    if (!existingDeadline) {
      return res.status(404).json({
        success: false,
        message: 'Deadline not found'
      });
    }

    // Prepare update data (only include provided fields)
    const updateData = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description ? description.trim() : null;
    if (due_date !== undefined) {
      // Process the due_date - preserve user's intended time
      let formattedDueDate = due_date;
      console.log('Updating due_date from:', due_date);
      
      // Handle different date formats
      if (/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
        // Date only format - add end of day time
        formattedDueDate = due_date + ' 23:59:59';
        console.log('Added time to date-only input:', formattedDueDate);
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(due_date)) {
        // Datetime-local format (YYYY-MM-DDTHH:mm) - add seconds
        formattedDueDate = due_date + ':00';
        console.log('Added seconds to datetime-local input:', formattedDueDate);
      }
      
      updateData.due_date = formattedDueDate;
      console.log('Final formatted due_date for update:', formattedDueDate);
    }
    if (priority !== undefined) updateData.priority = priority;
    if (status !== undefined) updateData.status = status;
    if (category !== undefined) updateData.category = category ? category.trim() : null;
    if (subject !== undefined) updateData.subject = subject ? subject.trim() : null;
    if (estimated_hours !== undefined) updateData.estimated_hours = estimated_hours ? parseInt(estimated_hours) : null;
    if (actual_hours !== undefined) updateData.actual_hours = actual_hours ? parseInt(actual_hours) : null;
    if (completion_percentage !== undefined) updateData.completion_percentage = parseInt(completion_percentage);
    if (notes !== undefined) updateData.notes = notes ? notes.trim() : null;

    // Merge with existing data
    const finalUpdateData = {
      title: updateData.title || existingDeadline.title,
      description: updateData.description !== undefined ? updateData.description : existingDeadline.description,
      due_date: updateData.due_date || existingDeadline.due_date,
      priority: updateData.priority || existingDeadline.priority,
      status: updateData.status || existingDeadline.status,
      category: updateData.category !== undefined ? updateData.category : existingDeadline.category,
      subject: updateData.subject !== undefined ? updateData.subject : existingDeadline.subject,
      estimated_hours: updateData.estimated_hours !== undefined ? updateData.estimated_hours : existingDeadline.estimated_hours,
      actual_hours: updateData.actual_hours !== undefined ? updateData.actual_hours : existingDeadline.actual_hours,
      completion_percentage: updateData.completion_percentage !== undefined ? updateData.completion_percentage : existingDeadline.completion_percentage,
      notes: updateData.notes !== undefined ? updateData.notes : existingDeadline.notes
    };

    const updatedDeadline = await Deadline.update(parseInt(id), finalUpdateData);

    res.json({
      success: true,
      message: 'Deadline updated successfully',
      data: {
        deadline: updatedDeadline
      }
    });

  } catch (error) {
    console.error('Update deadline error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update deadline status only
const updateDeadlineStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validation
    const errors = [];

    if (!id || isNaN(parseInt(id)) || parseInt(id) < 1) {
      errors.push('Valid deadline ID is required');
    }

    if (!status || !validateStatus(status)) {
      errors.push('Valid status is required (pending, in_progress, completed, overdue)');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Check if deadline exists
    const existingDeadline = await Deadline.findById(parseInt(id));
    if (!existingDeadline) {
      return res.status(404).json({
        success: false,
        message: 'Deadline not found'
      });
    }

    const updatedDeadline = await Deadline.updateStatus(parseInt(id), status);

    res.json({
      success: true,
      message: 'Deadline status updated successfully',
      data: {
        deadline: updatedDeadline
      }
    });

  } catch (error) {
    console.error('Update deadline status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete a deadline
const deleteDeadline = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id)) || parseInt(id) < 1) {
      return res.status(400).json({
        success: false,
        message: 'Valid deadline ID is required'
      });
    }

    // Check if deadline exists
    const existingDeadline = await Deadline.findById(parseInt(id));
    if (!existingDeadline) {
      return res.status(404).json({
        success: false,
        message: 'Deadline not found'
      });
    }

    await Deadline.delete(parseInt(id));

    res.json({
      success: true,
      message: 'Deadline deleted successfully'
    });

  } catch (error) {
    console.error('Delete deadline error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get upcoming deadlines
const getUpcomingDeadlines = async (req, res) => {
  try {
    const { days = 7 } = req.query;

    // Validation
    const errors = [];

    if (days && (isNaN(parseInt(days)) || parseInt(days) < 1 || parseInt(days) > 365)) {
      errors.push('Days must be between 1 and 365');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Get user ID from authenticated user
    const userId = req.user.userId;

    const deadlines = await DeadlineCollaborator.getUserUpcomingDeadlines(
      userId,
      parseInt(days)
    );

    res.json({
      success: true,
      data: {
        deadlines,
        count: deadlines.length
      }
    });

  } catch (error) {
    console.error('Get upcoming deadlines error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get overdue deadlines
const getOverdueDeadlines = async (req, res) => {
  try {
    // Get user ID from authenticated user
    const userId = req.user.userId;

    const deadlines = await DeadlineCollaborator.getUserOverdueDeadlines(userId);

    res.json({
      success: true,
      data: {
        deadlines,
        count: deadlines.length
      }
    });

  } catch (error) {
    console.error('Get overdue deadlines error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get deadline statistics
const getDeadlineStats = async (req, res) => {
  try {
    // Get user ID from authenticated user
    const userId = req.user.userId;

    const stats = await DeadlineCollaborator.getUserDeadlineStats(userId);
    console.log('Deadline stats for user', userId, ':', stats);

    res.json({
      success: true,
      data: {
        stats
      }
    });

  } catch (error) {
    console.error('Get deadline stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get deadlines by student ID
const getDeadlinesByStudentId = async (req, res) => {
  try {
    const { student_id } = req.params;
    const { status, priority, page = 1, limit = 10 } = req.query;

    // Validation
    const errors = [];

    if (!student_id || isNaN(parseInt(student_id)) || parseInt(student_id) < 1) {
      errors.push('Valid student ID is required');
    }

    if (status && !validateStatus(status)) {
      errors.push('Invalid status value');
    }

    if (priority && !validatePriority(priority)) {
      errors.push('Invalid priority value');
    }

    if (page && (isNaN(parseInt(page)) || parseInt(page) < 1)) {
      errors.push('Page must be a positive integer');
    }

    if (limit && (isNaN(parseInt(limit)) || parseInt(limit) < 1 || parseInt(limit) > 100)) {
      errors.push('Limit must be between 1 and 100');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Check if student exists
    const student = await User.findById(parseInt(student_id));
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const filters = {
      limit: parseInt(limit),
      offset
    };

    if (status) filters.status = status;
    if (priority) filters.priority = priority;

    const deadlines = await Deadline.findByStudentId(parseInt(student_id), filters);

    res.json({
      success: true,
      data: {
        deadlines,
        pagination: {
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get deadlines by student ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Add collaborators to existing deadline with copy creation
const addCollaboratorsToDeadline = async (req, res) => {
  try {
    const { id } = req.params;
    const { collaborators, create_copies = true, copy_options = {} } = req.body;
    const userId = req.user.userId;

    // Validation
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid deadline ID is required'
      });
    }

    if (!collaborators || !Array.isArray(collaborators) || collaborators.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Collaborators array is required and cannot be empty'
      });
    }

    // Check if deadline exists and user has permission
    const deadline = await Deadline.findById(parseInt(id));
    if (!deadline) {
      return res.status(404).json({
        success: false,
        message: 'Deadline not found'
      });
    }

    // Check if user is owner or has edit permissions
    // First check if user is the original owner (student_id)
    const isOriginalOwner = deadline.student_id === userId;
    
    // Then check if user has collaborator permissions
    const userCollaboration = await DeadlineCollaborator.getCollaboratorRole(parseInt(id), userId);
    
    const hasPermission = isOriginalOwner || 
                         (userCollaboration && (userCollaboration.role === 'owner' || userCollaboration.can_edit));
    
    if (!hasPermission) {
      console.log(`Permission check failed for user ${userId} on deadline ${id}:`);
      console.log(`- Is original owner: ${isOriginalOwner}`);
      console.log(`- Collaborator record:`, userCollaboration);
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to add collaborators to this deadline'
      });
    }

    // Validate collaborator user IDs and check for duplicates
    const validCollaborators = [];
    const skippedCollaborators = [];
    
    for (const collaboratorId of collaborators) {
      if (typeof collaboratorId !== 'number' && isNaN(parseInt(collaboratorId))) {
        return res.status(400).json({
          success: false,
          message: `Invalid collaborator ID: ${collaboratorId}`
        });
      }

      const collaboratorUserId = parseInt(collaboratorId);

      // Check if user is trying to add themselves
      if (collaboratorUserId === userId) {
        skippedCollaborators.push({
          user_id: collaboratorUserId,
          reason: 'Cannot add yourself as collaborator'
        });
        continue;
      }

      // Check if user is trying to add the deadline owner as a collaborator
      if (collaboratorUserId === deadline.student_id) {
        skippedCollaborators.push({
          user_id: collaboratorUserId,
          reason: 'Cannot add deadline owner as collaborator - they already own this deadline'
        });
        continue;
      }

      // Check if user is already a collaborator
      const existingCollaboration = await DeadlineCollaborator.getCollaboratorRole(parseInt(id), collaboratorUserId);
      if (existingCollaboration) {
        skippedCollaborators.push({
          user_id: collaboratorUserId,
          reason: 'User is already a collaborator',
          existing_role: existingCollaboration.role
        });
        continue;
      }

      const collaboratorUser = await User.findById(collaboratorUserId);
      if (!collaboratorUser) {
        return res.status(400).json({
          success: false,
          message: `User not found: ${collaboratorId}`
        });
      }

      // Check if users are friends (required)
      const friendship = await Friend.getFriendshipStatus(userId, collaboratorUserId);
      if (!friendship || friendship.status !== 'accepted') {
        return res.status(400).json({
          success: false,
          message: `User ${collaboratorId} is not in your friends list`
        });
      }

      validCollaborators.push(collaboratorUserId);
    }

    // Check if we have any valid collaborators to add
    if (validCollaborators.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid collaborators to add',
        data: {
          skipped_collaborators: skippedCollaborators,
          total_requested: collaborators.length,
          total_skipped: skippedCollaborators.length
        }
      });
    }

    // Add collaborators with copies
    const result = await DeadlineCollaborator.addCollaboratorsWithCopies(
      parseInt(id),
      validCollaborators,
      {
        createCopies: create_copies,
        copyOptions: {
          titleSuffix: copy_options.title_suffix || ' (My Copy)',
          createIndividualCopies: copy_options.create_individual_copies !== false
        },
        notifyCollaborators: copy_options.notify_collaborators !== false
      }
    );

    // Check for denied requests (original owners)
    const deniedCollaborators = result.filter(r => r.denied === true);
    const successfulCollaborators = result.filter(r => !r.denied && !r.error);
    
    // Combine all skipped/denied reasons
    const allSkipped = [...skippedCollaborators];
    deniedCollaborators.forEach(denied => {
      allSkipped.push({
        user_id: denied.user_id,
        reason: denied.error || denied.message,
        type: 'original_owner_denied'
      });
    });

    // Determine response based on results
    if (successfulCollaborators.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No collaborators were successfully added',
        data: {
          original_deadline_id: parseInt(id),
          collaborators_added: [],
          denied_collaborators: deniedCollaborators,
          skipped_collaborators: allSkipped,
          total_requested: collaborators.length,
          total_added: 0,
          total_denied: deniedCollaborators.length,
          total_skipped: allSkipped.length
        }
      });
    }

    res.json({
      success: true,
      message: `Successfully added ${successfulCollaborators.length} collaborator(s)${create_copies ? ' with individual copies' : ''}${allSkipped.length > 0 ? `. ${allSkipped.length} request(s) denied/skipped` : ''}`,
      data: {
        original_deadline_id: parseInt(id),
        collaborators_added: successfulCollaborators,
        copies_created: create_copies ? successfulCollaborators.filter(r => r.is_copy).length : 0,
        denied_collaborators: deniedCollaborators,
        skipped_collaborators: allSkipped,
        total_requested: collaborators.length,
        total_added: successfulCollaborators.length,
        total_denied: deniedCollaborators.length,
        total_skipped: allSkipped.length
      }
    });

  } catch (error) {
    console.error('Add collaborators error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
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
};
