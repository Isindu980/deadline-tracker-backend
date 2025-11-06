const nodemailer = require('nodemailer');

class EmailService {
        // Send password reset email
        async sendPasswordReset(userEmail, userName, resetUrl) {
                const subject = 'Password Reset Request';
                const html = `
                    <html>
                        <body style="font-family: Arial, sans-serif;">
                            <h2>Password Reset Request</h2>
                            <p>Hello <strong>${userName}</strong>,</p>
                            <p>We received a request to reset your password. Click the button below to set a new password:</p>
                            <p><a href="${resetUrl}" style="background:#4CAF50;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Reset Password</a></p>
                            <p>If you did not request this, you can safely ignore this email.</p>
                            <p>Best regards,<br>Deadline Tracker Team</p>
                        </body>
                    </html>
                `;
                const text = `Hello ${userName},\n\nWe received a request to reset your password. Use the following link to set a new password:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.\n\nDeadline Tracker Team`;
                return await this.sendEmail({ to: userEmail, subject, html, text });
        }
    constructor() {
        this.transporter = null;
        this.initializeTransporter();
    }

    // Initialize email transporter
    initializeTransporter() {
        try {
            // Gmail configuration (you can modify for other providers)
            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD // Use App Password for Gmail
                }
            });

            // Alternative SMTP configuration (uncomment if not using Gmail)
            /*
            this.transporter = nodemailer.createTransporter({
              host: process.env.SMTP_HOST,
              port: process.env.SMTP_PORT,
              secure: process.env.SMTP_SECURE === 'true',
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
              }
            });
            */

            console.log('📧 Email service initialized successfully');
        } catch (error) {
            console.error('❌ Email service initialization failed:', error && error.message ? error.message : error);
        }
    }

    // Verify email configuration
    async verifyConnection() {
        try {
            if (!this.transporter) {
                throw new Error('Email transporter not initialized');
            }

            await this.transporter.verify();
            console.log('✅ Email server connection verified');
            return true;
        } catch (error) {
            console.error('❌ Email server connection failed:', error && error.message ? error.message : error);
            return false;
        }
    }

    // Generate email templates
    generateEmailTemplate(type, data) {
        const { user, deadline, timeRemaining } = data;

        const templates = {
            'deadline-reminder': {
                subject: `⏰ Reminder: ${deadline.title} - Due ${timeRemaining}`,
                html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
              .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
              .deadline-info { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #ff9800; }
              .priority-urgent { border-left-color: #f44336; }
              .priority-high { border-left-color: #ff9800; }
              .priority-medium { border-left-color: #ffeb3b; }
              .priority-low { border-left-color: #4caf50; }
              .footer { background: #333; color: white; padding: 15px; text-align: center; border-radius: 0 0 5px 5px; }
              .btn { background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>📅 Deadline Reminder</h1>
              </div>
              <div class="content">
                <p>Hello <strong>${user.full_name || user.username}</strong>,</p>
                
                <p>This is a friendly reminder about your upcoming deadline:</p>
                
                <div class="deadline-info priority-${deadline.priority}">
                  <h3>${deadline.title}</h3>
                  <p><strong>Due:</strong> ${new Date(deadline.due_date).toLocaleString()}</p>
                  <p><strong>Time Remaining:</strong> ${timeRemaining}</p>
                  <p><strong>Priority:</strong> ${deadline.priority.toUpperCase()}</p>
                  <p><strong>Subject:</strong> ${deadline.subject || 'N/A'}</p>
                  <p><strong>Category:</strong> ${deadline.category || 'N/A'}</p>
                  ${deadline.description ? `<p><strong>Description:</strong> ${deadline.description}</p>` : ''}
                  ${deadline.estimated_hours ? `<p><strong>Estimated Hours:</strong> ${deadline.estimated_hours}h</p>` : ''}
                </div>
                
                <p>Current Status: <strong>${deadline.status.replace('_', ' ').toUpperCase()}</strong></p>
                
                ${deadline.notes ? `<p><strong>Notes:</strong> ${deadline.notes}</p>` : ''}
                
                <p>Don't forget to complete your task on time! </p>
                
              </div>
              <div class="footer">
                <p>Best regards,<br>Deadline Tracker Team</p>
                <p><small>This is an automated reminder. Please do not reply to this email.</small></p>
              </div>
            </div>
          </body>
          </html>
        `,
                text: `
Deadline Reminder

Hello ${user.full_name || user.username},

This is a reminder about your upcoming deadline:

Title: ${deadline.title}
Due: ${new Date(deadline.due_date).toLocaleString()}
Time Remaining: ${timeRemaining}
Priority: ${deadline.priority.toUpperCase()}
Subject: ${deadline.subject || 'N/A'}
Category: ${deadline.category || 'N/A'}
Status: ${deadline.status.replace('_', ' ').toUpperCase()}

${deadline.description ? `Description: ${deadline.description}` : ''}
${deadline.estimated_hours ? `Estimated Hours: ${deadline.estimated_hours}h` : ''}
${deadline.notes ? `Notes: ${deadline.notes}` : ''}

Don't forget to complete your task on time!

Best regards,
Deadline Tracker Team
        `
            },

            'overdue-notification': {
                subject: `🚨 OVERDUE: ${deadline.title}`,
                html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #f44336; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
              .content { background: #fff3e0; padding: 20px; border: 1px solid #ff9800; }
              .deadline-info { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #f44336; }
              .footer { background: #333; color: white; padding: 15px; text-align: center; border-radius: 0 0 5px 5px; }
              .btn { background: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🚨 OVERDUE DEADLINE</h1>
              </div>
              <div class="content">
                <p>Hello <strong>${user.full_name || user.username}</strong>,</p>
                
                <p><strong>⚠️ Your deadline has passed and requires immediate attention:</strong></p>
                
                <div class="deadline-info">
                  <h3>${deadline.title}</h3>
                  <p><strong>Was Due:</strong> ${new Date(deadline.due_date).toLocaleString()}</p>
                  <p><strong>Overdue By:</strong> ${timeRemaining}</p>
                  <p><strong>Priority:</strong> ${deadline.priority.toUpperCase()}</p>
                  <p><strong>Subject:</strong> ${deadline.subject || 'N/A'}</p>
                  ${deadline.description ? `<p><strong>Description:</strong> ${deadline.description}</p>` : ''}
                </div>
                
                <p>Please complete this task as soon as possible.</p>
                
              </div>
              <div class="footer">
                <p>Deadline Tracker Team</p>
              </div>
            </div>
          </body>
          </html>
        `
            }
        };

        return templates[type] || null;
    }

    // Send email
    async sendEmail({ to, subject, html, text }) {
        try {
            if (!this.transporter) {
                throw new Error('Email transporter not initialized');
            }

            const mailOptions = {
                from: {
                    name: 'Deadline Tracker',
                    address: process.env.EMAIL_USER
                },
                to: to,
                subject: subject,
                html: html,
                text: text
            };

            const result = await this.transporter.sendMail(mailOptions);
            console.log(`✅ Email sent successfully (messageId: ${result.messageId})`);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error('❌ Failed to send email:', error && error.message ? error.message : error);
            return { success: false, error: error && error.message ? error.message : error };
        }
    }

    // Send deadline reminder email
    async sendDeadlineReminder(user, deadline, timeRemaining) {
        try {
            const template = this.generateEmailTemplate('deadline-reminder', {
                user,
                deadline,
                timeRemaining
            });

            if (!template) {
                throw new Error('Failed to generate email template');
            }

            return await this.sendEmail({
                to: user.email,
                subject: template.subject,
                html: template.html,
                text: template.text
            });
        } catch (error) {
            console.error('Error sending deadline reminder:', error && error.message ? error.message : error);
            return { success: false, error: error && error.message ? error.message : error };
        }
    }

    // Send overdue notification
    async sendOverdueNotification(user, deadline, overdueDuration) {
        try {
            const template = this.generateEmailTemplate('overdue-notification', {
                user,
                deadline,
                timeRemaining: overdueDuration
            });

            if (!template) {
                throw new Error('Failed to generate email template');
            }

            return await this.sendEmail({
                to: user.email,
                subject: template.subject,
                html: template.html,
                text: template.text
            });
        } catch (error) {
            console.error('Error sending overdue notification:', error && error.message ? error.message : error);
            return { success: false, error: error && error.message ? error.message : error };
        }
    }

    // Format time remaining
    static formatTimeRemaining(milliseconds) {
        const days = Math.floor(milliseconds / (1000 * 60 * 60 * 24));
        const hours = Math.floor((milliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));

        if (days > 0) {
            return `${days} day${days > 1 ? 's' : ''} and ${hours} hour${hours > 1 ? 's' : ''}`;
        } else if (hours > 0) {
            return `${hours} hour${hours > 1 ? 's' : ''} and ${minutes} minute${minutes > 1 ? 's' : ''}`;
        } else {
            return `${minutes} minute${minutes > 1 ? 's' : ''}`;
        }
    }

    // Send daily summary email
    async sendDailySummary(user, summaryData) {
        try {
            const { 
                total_deadlines, 
                due_today, 
                upcoming_deadlines, 
                overdue_deadlines, 
                completed_today 
            } = summaryData;

            const subject = `📊 Daily Deadline Summary - ${new Date().toLocaleDateString()}`;
            
            let summaryText = '';
            let priorityColor = '#4CAF50'; // Green default
            
            if (overdue_deadlines > 0) {
                priorityColor = '#f44336'; // Red for overdue
                summaryText = `You have ${overdue_deadlines} overdue deadline${overdue_deadlines > 1 ? 's' : ''} that need attention.`;
            } else if (due_today > 0) {
                priorityColor = '#ff9800'; // Orange for due today
                summaryText = `You have ${due_today} deadline${due_today > 1 ? 's' : ''} due today.`;
            } else if (upcoming_deadlines > 0) {
                priorityColor = '#2196F3'; // Blue for upcoming
                summaryText = `You have ${upcoming_deadlines} deadline${upcoming_deadlines > 1 ? 's' : ''} coming up this week.`;
            } else if (completed_today > 0) {
                summaryText = `Great job! You completed ${completed_today} deadline${completed_today > 1 ? 's' : ''} today.`;
            } else {
                summaryText = 'No active deadlines. Enjoy your free time! 🎉';
            }

            const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: ${priorityColor}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
                    .stat-box { background: white; margin: 10px 0; padding: 15px; border-radius: 8px; border-left: 4px solid ${priorityColor}; }
                    .footer { text-align: center; margin-top: 20px; color: #666; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>📊 Daily Deadline Summary</h1>
                        <p>${new Date().toLocaleDateString()}</p>
                    </div>
                    <div class="content">
                        <p>Hello ${user.full_name || user.username},</p>
                        <p><strong>${summaryText}</strong></p>
                        
                        <div class="stat-box">
                            <h3>📋 Your Deadline Statistics</h3>
                            <ul>
                                <li><strong>Total Active:</strong> ${total_deadlines}</li>
                                <li><strong>Due Today:</strong> ${due_today}</li>
                                <li><strong>Due This Week:</strong> ${upcoming_deadlines}</li>
                                <li><strong>Overdue:</strong> ${overdue_deadlines}</li>
                                <li><strong>Completed Today:</strong> ${completed_today}</li>
                            </ul>
                        </div>
                        
                        ${overdue_deadlines > 0 ? '<p style="color: #f44336;"><strong>⚠️ Please prioritize your overdue deadlines!</strong></p>' : ''}
                        ${due_today > 0 ? '<p style="color: #ff9800;"><strong>🎯 Focus on deadlines due today!</strong></p>' : ''}
                        
                    </div>
                    <div class="footer">
                        <p>Best regards,<br>Deadline Tracker Team</p>
                        <p><small>This is your automated daily summary.</small></p>
                    </div>
                </div>
            </body>
            </html>
            `;

            const text = `
Daily Deadline Summary - ${new Date().toLocaleDateString()}

Hello ${user.full_name || user.username},

${summaryText}

Your Deadline Statistics:
- Total Active: ${total_deadlines}
- Due Today: ${due_today}
- Due This Week: ${upcoming_deadlines}
- Overdue: ${overdue_deadlines}
- Completed Today: ${completed_today}

${overdue_deadlines > 0 ? 'Please prioritize your overdue deadlines!' : ''}
${due_today > 0 ? 'Focus on deadlines due today!' : ''}

Best regards,
Deadline Tracker Team
            `;

            return await this.sendEmail({
                to: user.email,
                subject: subject,
                html: html,
                text: text
            });
        } catch (error) {
            console.error('Error sending daily summary:', error && error.message ? error.message : error);
            return { success: false, error: error && error.message ? error.message : error };
        }
    }

    // Test email functionality
    async sendTestEmail(to) {
        try {
            const testTemplate = {
                subject: '✅ Deadline Tracker - Email Service Test',
                html: `
          <h2>Email Service Test</h2>
          <p>Congratulations! Your email service is working correctly.</p>
          <p>Timestamp: ${new Date().toLocaleString()}</p>
          <p>This test email confirms that deadline notifications will be delivered successfully.</p>
        `,
                text: `
Email Service Test

Congratulations! Your email service is working correctly.
Timestamp: ${new Date().toLocaleString()}
This test email confirms that deadline notifications will be delivered successfully.
        `
            };

            return await this.sendEmail({
                to: to,
                subject: testTemplate.subject,
                html: testTemplate.html,
                text: testTemplate.text
            });
        } catch (error) {
            console.error('Error sending test email:', error && error.message ? error.message : error);
            return { success: false, error: error && error.message ? error.message : error };
        }
    }
}

module.exports = new EmailService();