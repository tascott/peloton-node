require('dotenv').config();
const { spawn } = require('child_process');

console.log('🚀 Starting Peloton sync...');

// Helper function to run a script and return a promise
function runScript(scriptPath) {
    return new Promise((resolve, reject) => {
        console.log(`\n📝 Running ${scriptPath}...`);
        
        const process = spawn('node', [scriptPath], { stdio: 'inherit' });
        
        process.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`${scriptPath} exited with code ${code}`));
                return;
            }
            resolve();
        });
        
        process.on('error', (err) => {
            reject(err);
        });
    });
}

// Run scripts in sequence
async function sync() {
    try {
        // First get all workouts
        await runScript('./saveWorkouts.js');
        
        // Then fetch song details for each workout
        await runScript('./fetchDetailedWorkouts.js');
        
        console.log('\n✅ Sync completed successfully!');
    } catch (error) {
        console.error('\n❌ Sync failed:', error);
        process.exit(1);
    }
}

sync();
