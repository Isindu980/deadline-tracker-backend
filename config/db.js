const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Log successful connection (fires when a new client is checked out)
pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
});

// Log errors but do NOT exit the process; Heroku should restart or we can retry
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    // Do not call process.exit here to avoid crashing the dyno; allow server to handle transient DB outages
});

// Helper to check DB connectivity during startup
async function checkConnection() {
    try {
        const client = await pool.connect();
        try {
            await client.query('SELECT 1');
            client.release();
            return true;
        } catch (queryErr) {
            client.release();
            console.error('Database ping failed:', queryErr.message || queryErr);
            return false;
        }
    } catch (connectErr) {
        console.error('Database connection failed:', connectErr.message || connectErr);
        return false;
    }
}

// Export pool for backwards compatibility and attach helper
pool.checkConnection = checkConnection;
module.exports = pool;