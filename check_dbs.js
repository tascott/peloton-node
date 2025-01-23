require('dotenv').config();
const {Pool} = require('pg');

async function checkDatabases() {
    // Check peloton_workouts
    const poolWorkouts = new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: 'peloton_workouts',
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT
    });

    // Check peloton_detailed
    const poolDetailed = new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: 'peloton_detailed',
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT
    });

    try {
        // Check workouts table in peloton_workouts
        const workoutsResult = await poolWorkouts.query(`
            SELECT COUNT(*) as count FROM workouts;
        `);
        console.log('\npeloton_workouts database:');
        console.log(`Total workouts: ${workoutsResult.rows[0].count}`);

        // Get a sample row
        const sampleWorkout = await poolWorkouts.query(`
            SELECT * FROM workouts LIMIT 1;
        `);
        if(sampleWorkout.rows.length > 0) {
            console.log('Sample workout:',sampleWorkout.rows[0]);
        }

        // Check detailed_workouts table in peloton_detailed
        const detailedResult = await poolDetailed.query(`
            SELECT COUNT(*) as count FROM detailed_workouts;
        `);
        console.log('\npeloton_detailed database:');
        console.log(`Total detailed workouts: ${detailedResult.rows[0].count}`);

        // Get a sample row
        const sampleDetailed = await poolDetailed.query(`
            SELECT * FROM detailed_workouts LIMIT 1;
        `);
        if(sampleDetailed.rows.length > 0) {
            console.log('Sample detailed workout:',sampleDetailed.rows[0]);
        }

    } catch(err) {
        console.error('Error:',err);
    } finally {
        poolWorkouts.end();
        poolDetailed.end();
    }
}

checkDatabases();