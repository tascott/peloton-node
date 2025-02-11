require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const readline = require('readline');

const RIDE_DETAILS_URL = 'https://api.onepeloton.com/api/ride/';

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Get session ID from session.json
function getSavedSession() {
    if(fs.existsSync('session.json')) {
        return JSON.parse(fs.readFileSync('session.json')).session_id;
    }
    return null;
}

async function fetchWorkoutDetails(workoutId) {
    const sessionId = getSavedSession();
    if (!sessionId) {
        console.error("❌ No session ID found in session.json");
        return;
    }

    try {
            headers: { Cookie: `peloton_session_id=${sessionId}` }
        const response = await axios.get(`${RIDE_DETAILS_URL}${workoutId}/details`,{
        });

        // Pretty print the result
        console.log(JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

// Prompt for workout ID
rl.question('Enter workout ID: ', (workoutId) => {
    fetchWorkoutDetails(workoutId).then(() => {
        rl.close();
    });
});