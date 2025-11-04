# Deadline Tracker Backend

A lightweight Node.js + Express backend for a deadline tracking app. It supports user authentication, per-deadline collaborators (with copy-based collaborator records), email and in-app notifications, scheduled background tasks, and password reset flows.

## Features

- User registration and authentication
- Create / update / delete deadlines
- Collaborator model (per-user copies) with ACL protections
- Email reminders and in-app notifications (multiple timeframes)
- Password reset (forgot / reset endpoints)
- Cron-based notification service (hourly, overdue checks, daily summaries)
- DB-backed notifications tracking (JSONB column `notifications_sent`)
- Logging hygiene: PII-exposing console logs have been removed or redacted. Consider using a structured logger for better privacy and observability.

## Quick start (Windows PowerShell)

1. Install dependencies

```powershell
npm install
```

2. Create a `.env` file at the project root with the required variables (example below).

3. Run the app locally (development)

```powershell
# recommended if you have nodemon
npx nodemon server.js
# or
node server.js
```

4. Open the API (default):
- Root: http://localhost:3000/ (shows a lightweight HTML welcome page)

## Required environment variables

Create a `.env` with the following (names may vary slightly depending on your setup):

- PORT (e.g., 3000)
- NODE_ENV (development|production)
- DATABASE_URL (Postgres URL)
  - Note for special characters: if your DB password contains `@`, `#`, etc., URL-encode it (e.g., `@` -> `%40`) or provide parts separately as env vars.
  - Example: `postgresql://postgres:MyP%40ssword@host:5432/dbname`
- JWT_SECRET (for authentication tokens)
- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (for email sending)
- EMAIL_FROM (address used in outgoing emails)

## Database & migrations

This repository uses PostgreSQL. A `migrations/` folder exists—apply migrations against your database before starting the server in production. If you don't use a migration tool, run the SQL files in `migrations/` manually.

## Important endpoints (examples)

- POST /api/auth/register — register a user
- POST /api/auth/login — authenticate
- POST /api/auth/forgot-password — request password reset email
- POST /api/auth/reset-password — reset password with token
- GET /api/deadlines — list deadlines for current user (collaborators included)
- POST /api/deadlines — create a deadline
- PUT /api/deadlines/:id — update a deadline
- POST /api/deadlines/:id/collaborators — add collaborator
- POST /api/deadlines/:id/notify — (internal/manual) trigger notifications for a deadline (may be implemented for testing)

Refer to the `routes/` folder for the full route list and controllers for request/response details.

## Notification service

The app includes a notification scheduler implemented in `services/notificationService.js`. It schedules:

- Hourly notification checks (reminders at 48h, 24h, 12h, 1h)
- Overdue checks (every 4 minutes)
- Daily summary job (8:00 AM)

You can manually trigger checks (the service exposes helper methods), but in production the service runs when the server starts. If you run multiple dynos/instances, ensure only one scheduler runs (or coordinate jobs via a separate worker).

## Security & logging

- Sensitive console outputs that printed user emails, user IDs, raw request bodies, or SQL rows have been removed or replaced with count-based or redacted messages.
- Recommendation: adopt a structured logger (winston or pino) with a redaction policy for PII. This centralizes log formatting and makes filtering easier.

## Heroku deployment notes

- Set `DATABASE_URL` in Heroku config vars. URL-encode any special characters in the password.
- Set other env vars (JWT_SECRET, SMTP_* etc.) via `heroku config:set`.
- The DB client and server initialization were hardened so the app doesn't crash immediately on DB outages; check logs with `heroku logs --tail` after deployment.

## Development tips

- To scan for remaining console statements that might print sensitive data:

```powershell
# simple grep-style search in PowerShell
Select-String -Path .\**\*.js -Pattern "console\." | Select-Object Path, LineNumber, Line
```

- Consider adding an ESLint rule or pre-commit hook to prevent committing `console.log` with string interpolation of user data.

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make changes and run tests / sanity checks locally
4. Open a pull request describing the change

## Notes & TODOs

- Some console usages were sanitized in core files (notification service, email service, controllers, models). A full repo-wide pass is recommended and is listed in the project todo list.
- Consider moving the notification cron to a dedicated worker process for scalability.

## Contact / Support

If you run into issues, open an issue in this repo with logs and environment details (but redact PII). For help with deployment, include your Heroku log tail output.

---

Thank you for using Deadline Tracker Backend — the README was added automatically by a helper; please review and adapt any environment variable names or startup commands to match your local workflows.
