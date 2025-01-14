require('dotenv').config();
const {Pool} = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: "peloton_workouts",
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});

// ✅ Create tables if they don’t exist
async function initDetailedDB() {
    const queries = [
        `CREATE TABLE IF NOT EXISTS detailed_workouts (
            id TEXT PRIMARY KEY,
            title TEXT,
            duration INTEGER,
            image_url TEXT,
            instructor_name TEXT,
            description TEXT,
            fitness_discipline TEXT,
            scheduled_time TIMESTAMP,
            difficulty_rating_avg NUMERIC,
            full_details JSONB
        );`,
        `CREATE TABLE IF NOT EXISTS songs (
            id SERIAL PRIMARY KEY,
            workout_id TEXT REFERENCES detailed_workouts(id) ON DELETE CASCADE,
            title TEXT
        );`,
        `CREATE TABLE IF NOT EXISTS artists (
            id SERIAL PRIMARY KEY,
            song_id INTEGER REFERENCES songs(id) ON DELETE CASCADE,
            artist_name TEXT,
            image_url TEXT
        );`
    ];

    try {
        const client = await pool.connect();
        for(const query of queries) {
            await client.query(query);
        }
        console.log("Database initialized");
        client.release();
    } catch(err) {
        console.error("Database error:",err);
    }
}

module.exports = {pool,initDetailedDB};