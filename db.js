require('dotenv').config();
const {Pool} = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});

// ✅ Create table if it doesn't exist (updated with `instructor_id` & `difficulty_rating_avg`)
async function initDB() {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS workouts (
            id TEXT PRIMARY KEY,
            title TEXT,
            instructor_id TEXT,  -- ✅ Stores only the instructor ID
            duration INTEGER,
            scheduled_time TIMESTAMP,
            difficulty_rating_avg NUMERIC, -- ✅ Added difficulty rating
            full_details JSONB
        );
    `;

    try {
        const client = await pool.connect();
        await client.query(createTableQuery);
        console.log("Database initialized (workouts table created if not exists).");
        client.release();
    } catch(err) {
        console.error("❌ Database error:",err);
    }
}

// ✅ Function to save workouts to PostgreSQL
async function saveWorkoutsToDB(workouts) {
    try {
        const client = await pool.connect();

        for(const workout of workouts) {
            const query = `
                INSERT INTO workouts (id, title, instructor_id, duration, scheduled_time, difficulty_rating_avg, full_details)
                VALUES ($1, $2, $3, $4, TO_TIMESTAMP($5), $6, $7)
                ON CONFLICT (id) DO NOTHING;
            `;

            const values = [
                workout.id,
                workout.title || "Unknown",
                workout.instructor_id || "Unknown",  // ✅ Store only the instructor ID
                workout.duration,
                workout.scheduled_start_time,
                workout.difficulty_rating_avg || null, // ✅ Save difficulty rating
                workout
            ];

            await client.query(query,values);
            console.log(`💾 Saved workout: ${workout.id}`);
        }

        client.release();
    } catch(err) {
        console.error("❌ Database error:",err);
    }
}

module.exports = {pool,initDB,saveWorkoutsToDB};
