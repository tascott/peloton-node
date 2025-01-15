require('dotenv').config();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Validate environment variables
const requiredEnvVars = {
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT
};

// Check for missing environment variables
const missingVars = Object.entries(requiredEnvVars)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    console.error(missingVars.join(', '));
    console.error('\nMake sure your .env file contains:');
    console.error(`
DB_USER=postgres
DB_PASSWORD=mysecretpassword
DB_HOST=localhost
DB_PORT=5432`);
    process.exit(1);
}

// Create backups directory if it doesn't exist
const BACKUP_DIR = './backups';
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
}

// Get timestamp for backup file
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = `web_optimized_${timestamp}.sql`;
const backupPath = path.join(BACKUP_DIR, backupFile);

// Create backup function - excluding full_details column
function createWebOptimizedBackup() {
    // Create a view without full_details column
    const createView = `PGPASSWORD=${process.env.DB_PASSWORD} psql \
-h ${process.env.DB_HOST} \
-U ${process.env.DB_USER} \
-p ${process.env.DB_PORT} \
-d peloton_detailed \
-c "DROP VIEW IF EXISTS web_workouts; DROP TABLE IF EXISTS web_workouts; CREATE TABLE web_workouts AS SELECT id, title, duration, image_url, instructor_id, description, fitness_discipline, scheduled_time, difficulty_rating_avg FROM detailed_workouts;"`;

    // Dump schema and data using the view
    const dumpCommand = `PGPASSWORD=${process.env.DB_PASSWORD} pg_dump \
-h ${process.env.DB_HOST} \
-U ${process.env.DB_USER} \
-p ${process.env.DB_PORT} \
-d peloton_detailed \
--schema-only \
--clean --if-exists \
--no-owner --no-acl \
--no-comments \
-t public.instructors \
-t public.web_workouts \
-t public.songs \
-f ${backupPath} \
&& PGPASSWORD=${process.env.DB_PASSWORD} pg_dump \
-h ${process.env.DB_HOST} \
-U ${process.env.DB_USER} \
-p ${process.env.DB_PORT} \
-d peloton_detailed \
--data-only \
--table public.instructors \
>> ${backupPath} \
&& PGPASSWORD=${process.env.DB_PASSWORD} pg_dump \
-h ${process.env.DB_HOST} \
-U ${process.env.DB_USER} \
-p ${process.env.DB_PORT} \
-d peloton_detailed \
--data-only \
--table public.web_workouts \
>> ${backupPath} \
&& PGPASSWORD=${process.env.DB_PASSWORD} pg_dump \
-h ${process.env.DB_HOST} \
-U ${process.env.DB_USER} \
-p ${process.env.DB_PORT} \
-d peloton_detailed \
--data-only \
--table public.songs \
>> ${backupPath} \
&& PGPASSWORD=${process.env.DB_PASSWORD} psql \
-h ${process.env.DB_HOST} \
-U ${process.env.DB_USER} \
-p ${process.env.DB_PORT} \
-d peloton_detailed \
-c "DROP TABLE IF EXISTS web_workouts; DROP VIEW IF EXISTS web_workouts;"`;

    // Drop both view and table after backup
    const dropView = `PGPASSWORD=${process.env.DB_PASSWORD} psql \
-h ${process.env.DB_HOST} \
-U ${process.env.DB_USER} \
-p ${process.env.DB_PORT} \
-d peloton_detailed \
-c "DROP TABLE IF EXISTS web_workouts; DROP VIEW IF EXISTS web_workouts;"`;

    return new Promise((resolve, reject) => {
        console.log(`📦 Creating web-optimized backup...`);
        console.log('1. Creating temporary table of workouts (without full_details)');
        console.log(`Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/peloton_detailed`);

        // Execute commands in sequence
        exec(createView, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Error creating temporary table:`, error);
                console.error('Error details:', stderr);
                reject(error);
                return;
            }
            console.log('2. Dumping schema and data in order:');
            console.log('   - Table schemas');
            console.log('   - Instructors data');
            console.log('   - Workouts data (without full_details)');
            console.log('   - Songs data');

            exec(dumpCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error(`❌ Error creating backup:`, error);
                    console.error('Error details:', stderr);
                    reject(error);
                    return;
                }
                console.log('3. Cleaning up temporary table');

                exec(dropView, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`❌ Error dropping temporary table:`, error);
                        console.error('Error details:', stderr);
                        reject(error);
                        return;
                    }

                    const size = (fs.statSync(backupPath).size / 1024 / 1024).toFixed(2);
                    console.log(`\n✅ Successfully created web-optimized backup: ${backupFile} (${size} MB)`);
                    console.log('\nTo restore to Supabase using transaction pooler:');
                    console.log(`psql "postgresql://postgres.badkkfgwyxqysfszjnxc:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres" -f ${backupPath}\n`);
                    resolve();
                });
            });
        });
    });
}

createWebOptimizedBackup();