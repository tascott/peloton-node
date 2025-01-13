require('dotenv').config();
const {Pool} = require('pg');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SESSION_FILE = 'session.json';
const PROGRESS_FILE = 'progress.json';
const WORKOUTS_DIR = './workouts_list';
const DETAILS_DIR = './workout_details';
const RIDE_DETAILS_URL = 'https://api.onepeloton.com/api/ride/';
const RATE_LIMIT_DELAY = 1000; // 1 second delay
const BATCH_SIZE = 100; // JSON backup batch size
const PELOTON_API_URL = 'https://api.onepeloton.com/api/user/';

// Ensure backup directory exists
if(!fs.existsSync(DETAILS_DIR)) fs.mkdirSync(DETAILS_DIR,{recursive: true});

// PostgreSQL Connection
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});

// Load session ID
function getSavedSession() {
    if(fs.existsSync(SESSION_FILE)) return JSON.parse(fs.readFileSync(SESSION_FILE)).session_id;
    return null;
}

// Load progress
function getLastProgress() {
    if(fs.existsSync(PROGRESS_FILE)) {
        return JSON.parse(fs.readFileSync(PROGRESS_FILE,'utf8'));
    }
    return {processed_rides: []};
}

// Save progress
function saveProgress(newProcessedRides) {
    const currentProgress = getLastProgress();
    const allProcessedRides = [...new Set([...currentProgress.processed_rides, ...newProcessedRides])];
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({processed_rides: allProcessedRides}));
    console.log(`💾 Saved progress: ${newProcessedRides.length} new rides processed`);
}

// Save JSON backups in batches
function saveJsonBackup(workouts) {
    const batchNumber = Math.floor(getLastProgress().processed_rides.length / BATCH_SIZE) + 1;
    const filePath = `${DETAILS_DIR}/workout_details_batch_${batchNumber}.json`;
    fs.writeFileSync(filePath,JSON.stringify(workouts,null,2));
    console.log(`💾 Saved backup: ${filePath}`);
}

// Save workout & songs to PostgreSQL
async function saveWorkoutToDB(workout,rideDetails) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Convert timestamp to proper PostgreSQL timestamp
        const scheduledTime = new Date(workout.scheduled_start_time * 1000);
        console.log(`💾 Saving workout ${workout.id} scheduled for ${scheduledTime.toISOString()}`);

        // Insert Workout (with additional fields)
        await client.query(`
            INSERT INTO workouts (id, title, instructor, duration, scheduled_time, difficulty, fitness_discipline, image_url, ride_type_id, video_url, full_details)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (id) DO NOTHING
        `, [
            workout.id,
            workout.title,
            rideDetails?.ride?.instructor?.name || "Unknown",
            workout.duration,
            scheduledTime.toISOString(), // Use ISO string format
            rideDetails.difficulty_estimate || null,
            rideDetails.fitness_discipline || null,
            rideDetails.image_url || null,
            rideDetails.ride_type_id || null,
            rideDetails.vod_stream_url || null,
            rideDetails
        ]);

        // Insert Songs
        if(rideDetails.playlist && Array.isArray(rideDetails.playlist.songs)) {
            for(const song of rideDetails.playlist.songs) {
                await client.query(`
                    INSERT INTO songs (ride_id, title, artists, album)
                    VALUES ($1, $2, $3, $4)
                `,[
                    workout.id,
                    song.title,
                    Array.isArray(song.artists) ? song.artists.map(a => a.artist_name).filter(Boolean).join(', ') : "Unknown",
                    song.album?.name || "Unknown"
                ]);
            }
        }

        await client.query('COMMIT');
        console.log(`✅ Saved workout ${workout.id} with ${rideDetails.playlist?.songs?.length || 0} songs`);
    } catch(error) {
        await client.query('ROLLBACK');
        console.error(`❌ Error saving workout ${workout.id}:`,error.message);
    } finally {
        client.release();
    }
}


// Fetch ride details
async function fetchRideDetails(sessionId,rideId) {
    try {
        const response = await axios.get(`${RIDE_DETAILS_URL}${rideId}/details`,{
            headers: {Cookie: `peloton_session_id=${sessionId}`}
        });

        return response.data;
    } catch(error) {
        console.error(`❌ Error fetching ride ${rideId}:`,error.response ? error.response.data : error.message);
        return null;
    }
}

// Fetch new workouts from Peloton API
async function fetchNewWorkouts(sessionId, afterTimestamp) {
    try {
        console.log('🔍 Fetching workouts with params:', {
            joins: 'ride',
            limit: 100,
            page: 0,
            sort_by: '-created',
            created_after: Math.floor(afterTimestamp) // Ensure it's a whole number
        });

        const response = await axios.get(`${PELOTON_API_URL}${process.env.PELOTON_USER_ID}/workouts`, {
            headers: {
                Cookie: `peloton_session_id=${sessionId}`,
                'Content-Type': 'application/json'
            },
            params: {
                joins: 'ride',
                limit: 100,
                page: 0,
                sort_by: '-created',
                created_after: Math.floor(afterTimestamp) // Ensure it's a whole number
            }
        });

        if (!response.data || !response.data.data) {
            console.log('📦 Raw API response:', response.data);
            return [];
        }

        return response.data.data;
    } catch (error) {
        console.error('❌ Error fetching workouts:', {
            status: error.response?.status,
            error: error.response?.data || error.message,
            timestamp: afterTimestamp,
            timestampDate: new Date(afterTimestamp * 1000).toISOString()
        });
        return [];
    }
}

// Process workouts (fetch 2 workouts for testing)
async function processWorkouts() {
    console.log("📂 Starting to process new workouts...");

    const currentDate = new Date();
    console.log(`🗓️ Current date: ${currentDate.toISOString()}`);

    const sessionId = getSavedSession();
    if (!sessionId) {
        console.error("❌ No session ID found. Please ensure session.json exists with valid credentials");
        return;
    }
    console.log("✅ Session ID loaded");

    const client = await pool.connect();
    try {
        // Get the latest processed workout's timestamp
        const res = await client.query(`
            SELECT MAX(scheduled_time) AS last_processed,
                   EXTRACT(EPOCH FROM MAX(scheduled_time))::integer as unix_timestamp
            FROM workouts;
        `);

        // Log the raw database values for debugging
        console.log('Raw database values:', {
            maxScheduledTime: res.rows[0].last_processed,
            unixTimestamp: res.rows[0].unix_timestamp,
            currentTimestamp: Math.floor(Date.now() / 1000)
        });

        // Calculate timestamp for fetching new workouts
        const now = Math.floor(Date.now() / 1000);
        let LAST_RUN_TIMESTAMP = res.rows[0].unix_timestamp
            ? Math.floor(Number(res.rows[0].unix_timestamp) - (24 * 60 * 60)) // Subtract 24 hours for overlap
            : now - (7 * 24 * 60 * 60); // Default to 7 days ago

        console.log(`📅 Fetching workouts after: ${new Date(LAST_RUN_TIMESTAMP * 1000).toISOString()} (Unix: ${LAST_RUN_TIMESTAMP})`);

        // Fetch new workouts from Peloton API
        const newWorkouts = await fetchNewWorkouts(sessionId, LAST_RUN_TIMESTAMP);
        console.log(`📥 Found ${newWorkouts.length} new workouts to process`);

        let processedCount = 0;
        let allWorkouts = [];
        let processedRides = [];

        for (const workout of newWorkouts) {
            console.log(`🔄 Processing workout: ${workout.id} from ${new Date(workout.created_at * 1000).toISOString()}`);

            const rideDetails = await fetchRideDetails(sessionId, workout.id);
            if (!rideDetails) continue;

            await saveWorkoutToDB(workout, rideDetails);

            allWorkouts.push({
                id: workout.id,
                title: workout.title,
                instructor: rideDetails?.ride?.instructor?.name || "Unknown",
                duration: workout.duration,
                scheduled_time: new Date(workout.created_at * 1000).toISOString(),
                songs: rideDetails.playlist?.songs.map(song => ({
                    title: song.title,
                    artists: Array.isArray(song.artists) ? song.artists.map(a => a.artist_name).join(', ') : "Unknown",
                    album: song.album?.name || "Unknown"
                })) || []
            });

            processedRides.push(workout.id);
            processedCount++;

            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        }

        // Save backups if we processed any workouts
        if (allWorkouts.length > 0) {
            saveJsonBackup(allWorkouts);
            saveProgress(processedRides);
        }

        console.log(`✅ Finished processing ${processedCount} new workouts`);
    } catch (err) {
        console.error("❌ Error processing workouts:", err);
    } finally {
        client.release();
    }
}


async function exportDataToJson() {
    console.log("📤 Exporting data from PostgreSQL to JSON files...");

    const client = await pool.connect();
    try {
        // Fetch workouts without full_details
        const res = await client.query(`
            SELECT id, title, instructor, duration, scheduled_time
            FROM workouts;
        `);
        const workouts = res.rows;

        let batchCount = 0;
        for(let i = 0;i < workouts.length;i += BATCH_SIZE) {
            const batch = workouts.slice(i,i + BATCH_SIZE);

            // Fetch songs for the batch
            for(let workout of batch) {
                const songsRes = await client.query(`
                    SELECT title, artists, album FROM songs WHERE ride_id = $1;
                `,[workout.id]);

                workout.songs = songsRes.rows; // Attach songs to each workout
            }

            const filePath = `${DETAILS_DIR}/workout_details_batch_${batchCount + 1}.json`;
            fs.writeFileSync(filePath,JSON.stringify(batch,null,2));
            console.log(`💾 Saved batch ${batchCount + 1}: ${filePath}`);
            batchCount++;
        }

        console.log("✅ JSON export complete!");
    } catch(error) {
        console.error("❌ Error exporting data to JSON:",error);
    } finally {
        client.release();
    }
}

async function getLastProcessedTimestamp() {
    const client = await pool.connect();
    try {
        const res = await client.query(`SELECT MAX(scheduled_time) AS last_processed FROM workouts;`);
        return res.rows[0].last_processed
            ? Math.floor(new Date(res.rows[0].last_processed).getTime() / 1000) // Convert to Unix timestamp
            : 0;
    } catch(err) {
        console.error("❌ Error fetching last processed timestamp:",err);
        return 0;
    } finally {
        client.release();
    }
}

// Add this function to help debug timestamps
async function checkDatabaseTimestamp() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT
                MAX(scheduled_time) AS last_processed,
                MIN(scheduled_time) AS earliest_workout,
                COUNT(*) as total_workouts
            FROM workouts;
        `);
        console.log('Database timestamp check:', {
            lastProcessed: res.rows[0].last_processed,
            lastProcessedUnix: res.rows[0].last_processed ? new Date(res.rows[0].last_processed).getTime() / 1000 : 0,
            earliestWorkout: res.rows[0].earliest_workout,
            totalWorkouts: res.rows[0].total_workouts
        });
    } finally {
        client.release();
    }
}

// Run the script
if(require.main === module) {
    checkDatabaseTimestamp().then(() => processWorkouts());
}


module.exports = {exportDataToJson};
