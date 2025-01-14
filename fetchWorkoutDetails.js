const fs = require('fs');
const axios = require('axios');

// ✅ Function to get the session ID from session.json
function getSessionId() {
    try {
        const sessionData = JSON.parse(fs.readFileSync('./session.json','utf8'));

        if(!sessionData.peloton_session_id) {
            throw new Error("No session ID found in session.json!");
        }

        return sessionData.peloton_session_id;
    } catch(err) {
        console.error("Error reading session.json:",err.message);
        process.exit(1);
    }
}

// ✅ Function to fetch workout details from Peloton API
async function fetchWorkoutDetails(workoutId) {
    try {
        const sessionId = getSessionId();
        const headers = {
            Cookie: `peloton_session_id=${sessionId}`,
            Accept: "*/*",
            Connection: "keep-alive"
        };

        const response = await axios.get(`https://api.onepeloton.com/api/ride/${workoutId}/details`,{
            headers
        });

        console.log(`Successfully fetched details for workout ${workoutId}`);
        return response.data;
    } catch(error) {
        console.error(`Error fetching workout ${workoutId}:`,error.response ? error.response.data : error.message);
        return null;
    }
}

module.exports = fetchWorkoutDetails;

