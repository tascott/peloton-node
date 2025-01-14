require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const LOGIN_URL = "https://api.onepeloton.com/auth/login";
const SESSION_FILE = "./session.json";

async function authenticatePeloton() {
    try {
        // 🔹 Always check session.json first
        if(fs.existsSync(SESSION_FILE)) {
            const savedSession = JSON.parse(fs.readFileSync(SESSION_FILE,'utf8'));
            if(savedSession.session_id) {
                console.log("🔑 Using saved Peloton session ID:",savedSession.session_id);
                return savedSession.session_id;
            }
        }

        // 🔹 Log in and get a new session ID if none exists
        console.log("🔓 Logging in to Peloton...");
        const response = await axios.post(LOGIN_URL,{
            username_or_email: process.env.PELOTON_USERNAME,
            password: process.env.PELOTON_PASSWORD
        });

        const sessionId = response.data.session_id;
        if(!sessionId) throw new Error("❌ No session ID received.");

        console.log("✅ New session ID:",sessionId);

        fs.writeFileSync(SESSION_FILE,JSON.stringify({session_id: sessionId},null,2));
        console.log("✅ Session saved.");

        return sessionId;
    } catch(error) {
        console.error("❌ Authentication failed:",error.response?.data || error.message);
        process.exit(1);
    }
}

module.exports = {authenticatePeloton};
