require('dotenv').config();
const {Pool} = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: "peloton_detailed",
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});

// Create table if it doesn't exist
async function initDB() {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS detailed_workouts (
            id TEXT PRIMARY KEY,
            title TEXT,
            instructor_id TEXT,
            duration INTEGER,
            scheduled_time TIMESTAMP,
            difficulty_rating_avg NUMERIC,
            description TEXT,
            fitness_discipline TEXT,
            image_url TEXT,
            full_details JSONB
        );
    `;

    try {
        const client = await pool.connect();
        await client.query(createTableQuery);
        console.log("Database initialized (detailed_workouts table created if not exists).");
        client.release();
    } catch(err) {
        console.error("Database error:", err);
    }
}

// Function to save workouts to PostgreSQL
async function saveWorkoutsToDB(workouts) {
    try {
        const client = await pool.connect();

        for(const workout of workouts) {
            const query = `
                INSERT INTO detailed_workouts (
                    id, 
                    title, 
                    instructor_id, 
                    duration, 
                    scheduled_time, 
                    difficulty_rating_avg,
                    description,
                    fitness_discipline,
                    image_url,
                    full_details
                )
                VALUES ($1, $2, $3, $4, TO_TIMESTAMP($5), $6, $7, $8, $9, $10)
                ON CONFLICT (id) DO NOTHING;
            `;

            const values = [
                workout.id,
                workout.title || "Unknown",
                workout.instructor_id || "Unknown",
                workout.duration,
                workout.scheduled_start_time,
                workout.difficulty_rating_avg || null,
                workout.description || null,
                workout.fitness_discipline || null,
                workout.image_url || null,
                workout
            ];

            await client.query(query, values);
            console.log(`Saved workout: ${workout.id}`);
        }

        client.release();
    } catch(err) {
        console.error("Database error:", err);
    }
}

module.exports = {pool,initDB,saveWorkoutsToDB};
