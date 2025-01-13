require('dotenv').config();
const {Pool} = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});

async function testDB() {
    try {
        const res = await pool.query('SELECT NOW()');
        console.log("✅ Connected to PostgreSQL! Current time:",res.rows[0].now);
    } catch(err) {
        console.error("❌ Database connection error:",err);
    } finally {
        pool.end();
    }
}

testDB();
