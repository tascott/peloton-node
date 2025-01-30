require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const axios = require('axios');

const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME
});

// ✅ Get session ID from session.json
function getSessionId() {
    try {
        const sessionData = JSON.parse(fs.readFileSync('./session.json', 'utf8'));
        if (!sessionData.session_id) {
            throw new Error("No session ID found in session.json!");
        }
        return sessionData.session_id;
    } catch (err) {
        console.error("Error reading session.json:", err.message);
        process.exit(1);
    }
}

// ✅ Fetch workout details from Peloton API
async function fetchWorkoutDetails(workoutId) {
    try {
        const sessionId = getSessionId();
        const headers = {
            Cookie: `peloton_session_id=${sessionId}`,
            Accept: "*/*",
            Connection: "keep-alive"
        };

        const response = await axios.get(`https://api.onepeloton.com/api/ride/${workoutId}/details`, {
            headers
        });

        console.log(`Successfully fetched details for workout ${workoutId}`);
        return response.data;
    } catch (error) {
        console.error(`Error fetching workout ${workoutId}:`, error.response ? error.response.data : error.message);
        return null;
    }
}

// ✅ Initialize database tables if they don't exist
async function initDetailedTable() {
    const client = await pool.connect();
    try {
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
                instructor_id TEXT REFERENCES instructors(id),
                description TEXT,
                fitness_discipline TEXT,
                scheduled_time TIMESTAMP,
                difficulty_rating_avg NUMERIC,
                full_details JSONB
            );

            CREATE TABLE IF NOT EXISTS songs (
                workout_id TEXT REFERENCES detailed_workouts(id),
                title TEXT,
                artist_names TEXT,
                image_url TEXT,
                playlist_order INTEGER,
                UNIQUE(workout_id, title)
            );

            CREATE INDEX IF NOT EXISTS idx_songs_artist_names ON songs USING gin (artist_names gin_trgm_ops);
            CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
            CREATE INDEX IF NOT EXISTS idx_workouts_scheduled_time ON detailed_workouts(scheduled_time);
        `);
    } finally {
        client.release();
    }
}

// ✅ Fetch all workout IDs from database
async function fetchAndSaveDetailedWorkouts() {
    console.log("📥 Fetching all workout IDs from database...");

    const client = await pool.connect();
    try {
        // Get IDs of workouts that don't have songs yet
        const res = await client.query(`
            WITH latest_song AS (
                SELECT MAX(dw.scheduled_time) - INTERVAL '1 day' as cutoff_date
                FROM songs s
                JOIN detailed_workouts dw ON s.workout_id = dw.id
            ),
            workout_song_counts AS (
                SELECT 
                    dw.id,
                    dw.title,
                    dw.scheduled_time,
                    COUNT(s.workout_id) as song_count
                FROM detailed_workouts dw
                LEFT JOIN songs s ON dw.id = s.workout_id
                GROUP BY dw.id, dw.title, dw.scheduled_time
            )
            SELECT id, title, scheduled_time
            FROM workout_song_counts, latest_song
            WHERE song_count = 0
              AND scheduled_time >= latest_song.cutoff_date
            ORDER BY scheduled_time DESC;
        `);
        
        const workouts = res.rows;
        console.log(`📊 Found ${workouts.length} workouts that need song data`);
        console.log(`\n`);

        let processed = 0;
        let skipped = 0;
        let failed = 0;

        for(const workout of workouts) {
            try {
                console.log(`\n🔄 Fetching detailed data for workout ${workout.id}...`);
                const details = await fetchWorkoutDetails(workout.id);

                if(!details || !details.ride) {
                    console.log(`❌ Failed to fetch details for ${workout.id}, skipping...`);
                    failed++;
                    continue;
                }

                await client.query('BEGIN');

                // First, ensure instructor exists
                if (details.ride.instructor) {
                    const insertInstructorQuery = `
                        INSERT INTO instructors (id, name, image_url)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (id) DO NOTHING;
                    `;
                    await client.query(insertInstructorQuery, [
                        details.ride.instructor.id,
                        details.ride.instructor.name,
                        details.ride.instructor.image_url || null
                    ]);
                }

                // Insert songs with artist information
                if (details.playlist && details.playlist.songs) {
                    const insertSongQuery = `
                        INSERT INTO songs (
                            workout_id,
                            title,
                            artist_names,
                            image_url,
                            playlist_order
                        ) 
                        SELECT $1, $2, $3, $4, $5
                        WHERE NOT EXISTS (
                            SELECT 1 FROM songs 
                            WHERE workout_id = $1 AND title = $2
                        )
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

                        await client.query(insertSongQuery, [
                            details.ride.id,
                            song.title,
                            artistNames,
                            imageUrl,
                            i  // playlist order
                        ]);
                    }
                }

                await client.query('COMMIT');
                console.log(`✅ Saved song data for workout ${workout.id}`);
                console.log(`📊 Progress - Skipped: ${skipped}, Processed: ${processed}, Failed: ${failed}`);

                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));

                processed++;

            } catch(err) {
                await client.query('ROLLBACK');
                console.error(`❌ Error processing workout ${workout.id}:`, err);
                failed++;
                continue;
            }
        }

        console.log(`\n\n📊 Final Summary:`);
        console.log(`✅ Successfully processed: ${processed}`);
        console.log(`⏭ Already existed/skipped: ${skipped}`);
        console.log(`❌ Failed to process: ${failed}`);
        console.log(`📊 Total workouts checked: ${workouts.length}`);

    } catch(err) {
        console.error("❌ Error during migration:", err);
    } finally {
        client.release();
    }
}

// ✅ Initialize tables and start processing
initDetailedTable()
    .then(() => fetchAndSaveDetailedWorkouts())
    .catch(err => console.error("❌ Error:", err));
