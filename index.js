require('dotenv').config();
const axios = require('axios');
const {authenticatePeloton} = require('./auth'); // Import auth function

const BASE_URL = "https://api.onepeloton.com/api/v2/ride/archived?browse_category=cycling";
const LIMIT = 50;  // Max 50 per request
const TOTAL_WORKOUTS = 200;  // Fetch 200 rides
const RATE_LIMIT_DELAY = 1000; // 1-second delay to prevent rate limiting

async function fetchRecentCyclingWorkouts() {
    const SESSION_ID = await authenticatePeloton(); // 🔹 Get session from auth.js

    console.log("\n📡 Using Session ID:",SESSION_ID);

    let page = 0;
    let fetchedWorkouts = 0;

    while(fetchedWorkouts < TOTAL_WORKOUTS) {
        const url = `${BASE_URL}&limit=${LIMIT}&page=${page}`;

        const headers = {
            'Accept': '*/*',
            'Connection': 'keep-alive',
            'Content-Type': 'application/json',
            'Referer': 'https://members.onepeloton.com/',
            'Origin': 'https://members.onepeloton.com',
            'Cookie': `peloton_session_id=${SESSION_ID}`
        };

        console.log(`\n🔄 Fetching: ${url}`);
        console.log("🔍 Headers:",headers);

        try {
            const response = await axios.get(url,{headers});

            console.log("✅ Response received!");
            const workouts = response.data.data;

            workouts.forEach(workout => {
                const workoutId = workout.id;
                const formattedDate = new Date(workout.scheduled_start_time * 1000).toISOString();
                console.log(`🆔 ${workoutId}  📅 ${formattedDate}`);
            });

            fetchedWorkouts += workouts.length;
            page++;

            if(workouts.length < LIMIT) {
                console.log("\n✅ No more workouts available. Stopping.");
                break;
            }

            await new Promise(resolve => setTimeout(resolve,RATE_LIMIT_DELAY));

        } catch(error) {
            console.error("❌ Fetch error:",error.response ? error.response.data : error.message);
            break;
        }
    }

    console.log(`\n✅ Finished fetching ${fetchedWorkouts} workouts.`);
}

// Run the function
fetchRecentCyclingWorkouts();
