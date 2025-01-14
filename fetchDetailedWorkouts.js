require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const {Pool} = require('pg');
const fetchWorkoutDetails = require('./fetchWorkoutDetails');

// ✅ Database connections
const poolWorkouts = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: "peloton_workouts",
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});

const poolDetailed = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: "peloton_detailed",
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});

// First, ensure the detailed tables exist
async function initDetailedTable() {
    const client = await poolDetailed.connect();
    try {
        // Enable text search extension for better artist name searching
        await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');

        await client.query(`
            CREATE TABLE IF NOT EXISTS instructors (
                id TEXT PRIMARY KEY,
                name TEXT,
                image_url TEXT
            );

            CREATE TABLE IF NOT EXISTS detailed_workouts (
                id TEXT PRIMARY KEY,
                title TEXT,
                duration INTEGER,
                image_url TEXT,
                instructor_id TEXT REFERENCES instructors(id),
                description TEXT,
                fitness_discipline TEXT,
                scheduled_time TIMESTAMP,
                difficulty_rating_avg NUMERIC,
                full_details JSONB
            );

            CREATE TABLE IF NOT EXISTS songs (
                id SERIAL PRIMARY KEY,
                workout_id TEXT REFERENCES detailed_workouts(id) ON DELETE CASCADE,
                title TEXT,
                artist_names TEXT,
                image_url TEXT,
                playlist_order INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_songs_artist_names ON songs USING gin (artist_names gin_trgm_ops);
            CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
            CREATE INDEX IF NOT EXISTS idx_workouts_scheduled_time ON detailed_workouts(scheduled_time);
            CREATE INDEX IF NOT EXISTS idx_workouts_instructor ON detailed_workouts(instructor_id);
        `);
    } finally {
        client.release();
    }
}

// ✅ Fetch all workout IDs from first DB
async function fetchAndSaveDetailedWorkouts() {
    console.log("📥 Fetching all workout IDs from first database (peloton_workouts)...");

    const clientOld = await poolWorkouts.connect();
    const clientNew = await poolDetailed.connect();

    try {
        // Get IDs of already saved detailed workouts
        const existingRes = await clientNew.query('SELECT id FROM detailed_workouts');
        const existingWorkoutIds = new Set(existingRes.rows.map(row => row.id));

        // Get all workouts from first database
        const res = await clientOld.query('SELECT id, title, scheduled_time FROM workouts');
        const workouts = res.rows;

        for(const workout of workouts) {
            try {
                if(existingWorkoutIds.has(workout.id)) {
                    console.log(`⏭ Skipping ${workout.id}, already saved.`);
                    continue;
                }

                console.log(`🔄 Fetching detailed data for workout ${workout.id}...`);
                const details = await fetchWorkoutDetails(workout.id);

                if(!details || !details.ride) {
                    console.log(`❌ Failed to fetch details for ${workout.id}, skipping...`);
                    continue;
                }

                await clientNew.query('BEGIN');

                // First, ensure instructor exists
                if (details.ride.instructor) {
                    const insertInstructorQuery = `
                        INSERT INTO instructors (id, name, image_url)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (id) DO NOTHING;
                    `;
                    await clientNew.query(insertInstructorQuery, [
                        details.ride.instructor.id,
                        details.ride.instructor.name,
                        details.ride.instructor.image_url || null
                    ]);
                }

                // Insert workout details
                const insertWorkoutQuery = `
                    INSERT INTO detailed_workouts (
                        id,
                        title,
                        duration,
                        image_url,
                        instructor_id,
                        description,
                        fitness_discipline,
                        scheduled_time,
                        difficulty_rating_avg,
                        full_details
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    RETURNING id;
                `;

                await clientNew.query(insertWorkoutQuery, [
                    details.ride.id,
                    details.ride.title,
                    details.ride.duration,
                    details.ride.image_url,
                    details.ride.instructor?.id || null,
                    details.ride.description,
                    details.ride.fitness_discipline,
                    new Date(details.ride.scheduled_start_time * 1000),
                    details.ride.difficulty_rating_avg,
                    details
                ]);

                // Insert songs with artist information
                if (details.playlist && details.playlist.songs) {
                    const insertSongQuery = `
                        INSERT INTO songs (
                            workout_id,
                            title,
                            artist_names,
                            image_url,
                            playlist_order
                        ) VALUES ($1, $2, $3, $4, $5);
                    `;

                    for (let i = 0; i < details.playlist.songs.length; i++) {
                        const song = details.playlist.songs[i];

                        // Combine all artist names into a comma-separated string
                        const artistNames = song.artists
                            .map(artist => artist.artist_name)
                            .filter(name => name) // Remove any null/empty values
                            .join(', ');

                        // Use the first artist's image_url if available
                        const imageUrl = song.artists[0]?.image_url || null;

                        await clientNew.query(insertSongQuery, [
                            details.ride.id,
                            song.title,
                            artistNames,
                            imageUrl,
                            i  // playlist order
                        ]);
                    }
                }

                await clientNew.query('COMMIT');
                console.log(`✅ Saved detailed data for workout ${workout.id}`);

                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch(err) {
                await clientNew.query('ROLLBACK');
                console.error(`❌ Error processing workout ${workout.id}:`, err);
                continue;
            }
        }

    } catch(err) {
        console.error("❌ Error during migration:", err);
    } finally {
        clientOld.release();
        clientNew.release();
    }
}

// ✅ Run function
fetchAndSaveDetailedWorkouts();
