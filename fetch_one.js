require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

async function fetchOneWorkout() {
    try {
        // Read session ID from session.json
        const sessionData = JSON.parse(fs.readFileSync('./session.json','utf8'));
        const SESSION_ID = sessionData.session_id;

        const url = 'https://api.onepeloton.com/api/v2/ride/archived?browse_category=cycling&limit=1&page=0';

        const headers = {
            'Accept': '*/*',
            'Connection': 'keep-alive',
            'Content-Type': 'application/json',
            'Cookie': `peloton_session_id=${SESSION_ID}`
        };

        const response = await axios.get(url,{headers});

        // Pretty print the result
        console.log(JSON.stringify(response.data.data[0],null,2));
    } catch(error) {
        console.error('Error:',error.response?.data || error.message);
    }
}

fetchOneWorkout();