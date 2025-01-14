require('dotenv').config();
const axios = require('axios');
const {authenticatePeloton} = require('./auth');
const {pool,initDB,saveWorkoutsToDB} = require('./db');

const BASE_URL = "https://api.onepeloton.com/api/v2/ride/archived?browse_category=cycling";
const RATE_LIMIT_DELAY = 2000;  // ✅ 2-second delay to prevent rate limits

async function fetchAndSaveWorkouts() {
    await initDB();  // ✅ Ensure DB is initialized

    const SESSION_ID = await authenticatePeloton();
    console.log("\n📡 Using Session ID:",SESSION_ID);

    let page = 0;
    let totalFetched = 0;

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

        console.log(`\n🔄 Fetching page ${page}...`);

        try {
            const response = await axios.get(url,{headers});

            if(!response.data.data || response.data.data.length === 0) {
                console.log("✅ No more workouts available. Stopping.");
                break;
            }

            const workouts = response.data.data;
            let newEntries = 0;

            for(const workout of workouts) {
                const exists = await checkIfWorkoutExists(workout.id);

                if(!exists) {
                    newEntries++;
                }
            }

            if(newEntries === 0) {
                console.log(`✅ All workouts on page ${page} are already in DB. Stopping.`);
                break;
            }

            totalFetched += newEntries;
            page++;

            // ✅ Save to PostgreSQL
            await saveWorkoutsToDB(workouts);
            console.log(`💾 Saved ${newEntries} new workouts to DB.`);
            await new Promise(resolve => setTimeout(resolve,RATE_LIMIT_DELAY));

        } catch(error) {
            console.error("❌ Fetch error:",error.response ? error.response.data : error.message);
            break;
        }
    }

    console.log(`\n✅ Finished fetching ${totalFetched} new workouts.`);
}

// ✅ Check if workout exists in DB
async function checkIfWorkoutExists(workoutId) {
    const client = await pool.connect();
    try {
        const res = await client.query("SELECT 1 FROM workouts WHERE id = $1 LIMIT 1;",[workoutId]);
        return res.rowCount > 0;
    } finally {
        client.release();
    }
}

// Run the function
fetchAndSaveWorkouts();
