require('dotenv').config();
const axios = require('axios');
const {authenticatePeloton} = require('./auth');
const {pool,initDB,saveWorkoutsToDB} = require('./db');

const BASE_URL = "https://api.onepeloton.com/api/v2/ride/archived?browse_category=cycling";
const RATE_LIMIT_DELAY = 2000;  // 2-second delay to prevent rate limits

async function fetchAndSaveWorkouts() {
    await initDB();  // Ensure DB is initialized

    const SESSION_ID = await authenticatePeloton();
    console.log("\n Using Session ID:",SESSION_ID);

    let page = 0;
    let totalFetched = 0;
    let totalExisting = 0;
    let totalPages = 0;

    while(true) {
        const url = `${BASE_URL}&limit=50&page=${page}`;

        const headers = {
            'Accept': '*/*',
            'Connection': 'keep-alive',
            'Content-Type': 'application/json',
            'Referer': 'https://members.onepeloton.com/',
            'Origin': 'https://members.onepeloton.com',
            'Cookie': `peloton_session_id=${SESSION_ID}`
        };

        console.log(`\n Fetching page ${page}...`);

        try {
            const response = await axios.get(url,{headers});

            if(!response.data.data || response.data.data.length === 0) {
                console.log(" No more workouts available. Stopping.");
                break;
            }

            const workouts = response.data.data;
            totalPages++;

            console.log(` Found ${workouts.length} workouts on page ${page}`);
            console.log(`   First workout: ${workouts[0].title} (${new Date(workouts[0].scheduled_start_time * 1000).toISOString()})`);
            console.log(`   Last workout: ${workouts[workouts.length - 1].title} (${new Date(workouts[workouts.length - 1].scheduled_start_time * 1000).toISOString()})`);

            let newEntries = 0;
            let existingOnPage = 0;

            for(const workout of workouts) {
                const exists = await checkIfWorkoutExists(workout.id);
                if(!exists) {
                    newEntries++;
                } else {
                    existingOnPage++;
                    totalExisting++;
                }

                // Add this before the insert to debug
                console.log('Workout data:',{
                    id: workout.id,
                    instructor_id: workout.instructor_id
                });

                // Before saving workouts, save instructor
                const insertInstructorQuery = `
                    INSERT INTO instructors (id, name)
                    VALUES ($1, $2)
                    ON CONFLICT (id) DO NOTHING;
                `;

                // For each workout that has an instructor
                if(workout.instructor_id) {
                    const client = await pool.connect();
                    try {
                        await client.query(insertInstructorQuery,[
                            workout.instructor_id,
                            workout.instructor?.name || 'Unknown Instructor'
                        ]);
                    } finally {
                        client.release();
                    }
                }
            }

            if(newEntries === 0) {
                console.log(` All ${existingOnPage} workouts on page ${page} already exist in DB. Stopping.`);
                break;
            }

            totalFetched += newEntries;
            console.log(` Page ${page}: ${newEntries} new, ${existingOnPage} existing`);

            // Save to PostgreSQL
            await saveWorkoutsToDB(workouts);
            console.log(` Saved ${newEntries} new workouts to DB.`);

            page++;
            await new Promise(resolve => setTimeout(resolve,RATE_LIMIT_DELAY));

        } catch(error) {
            console.error(" Fetch error:",error.response ? error.response.data : error.message);
            break;
        }
    }

    console.log(`\n Final Summary:`);
    console.log(` Pages checked: ${totalPages}`);
    console.log(` New workouts added: ${totalFetched}`);
    console.log(` Existing workouts found: ${totalExisting}`);
    console.log(` Total workouts seen: ${totalFetched + totalExisting}`);
}

// Check if workout exists in DB
async function checkIfWorkoutExists(workoutId) {
    const client = await pool.connect();
    try {
        const res = await client.query("SELECT 1 FROM detailed_workouts WHERE id = $1 LIMIT 1;",[workoutId]);
        return res.rowCount > 0;
    } finally {
        client.release();
    }
}

// Run the function
fetchAndSaveWorkouts();
