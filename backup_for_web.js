require('dotenv').config();
const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

// Create backups directory if it doesn't exist
const BACKUP_DIR = './web_backups';
if(!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
}

const timestamp = new Date().toISOString().replace(/[:.]/g,'-');
const schemaPath = path.join(BACKUP_DIR,`schema_${timestamp}.sql`);
const workoutsPath = path.join(BACKUP_DIR,`workouts_${timestamp}.sql`);
const songsPath = path.join(BACKUP_DIR,`songs_${timestamp}.sql`);

try {
    // Create schema backup with transaction boundaries
    console.log('Creating schema backup...');
    execSync(`
        echo 'BEGIN;' > ${schemaPath} && \
        echo 'DROP TABLE IF EXISTS public.songs;' >> ${schemaPath} && \
        echo 'DROP TABLE IF EXISTS public.detailed_workouts;' >> ${schemaPath} && \
        echo 'DROP TABLE IF EXISTS public.instructors;' >> ${schemaPath} && \
        PGPASSWORD=${process.env.DB_PASSWORD} pg_dump -h ${process.env.DB_HOST} \
        -U ${process.env.DB_USER} -d peloton_detailed \
        -t detailed_workouts -t songs -t instructors \
        --schema-only --no-owner --no-acl --no-comments >> ${schemaPath} && \
        echo 'COMMIT;' >> ${schemaPath}
    `);

    // Create workouts backup with transaction boundaries
    console.log('Creating workouts backup...');
    execSync(`
        echo 'BEGIN;' > ${workoutsPath} && \
        PGPASSWORD=${process.env.DB_PASSWORD} pg_dump -h ${process.env.DB_HOST} \
        -U ${process.env.DB_USER} -d peloton_detailed \
        -t detailed_workouts --data-only --no-owner --no-acl --no-comments >> ${workoutsPath} && \
        echo 'COMMIT;' >> ${workoutsPath}
    `);

    // Create songs backup with transaction boundaries
    console.log('Creating songs backup...');
    execSync(`
        echo 'BEGIN;' > ${songsPath} && \
        PGPASSWORD=${process.env.DB_PASSWORD} pg_dump -h ${process.env.DB_HOST} \
        -U ${process.env.DB_USER} -d peloton_detailed \
        -t songs --data-only --no-owner --no-acl --no-comments >> ${songsPath} && \
        echo 'COMMIT;' >> ${songsPath}
    `);

    // Get file sizes
    const schemaStats = fs.statSync(schemaPath);
    const workoutsStats = fs.statSync(workoutsPath);
    const songsStats = fs.statSync(songsPath);

    const schemaSizeMB = (schemaStats.size / (1024 * 1024)).toFixed(2);
    const workoutsSizeMB = (workoutsStats.size / (1024 * 1024)).toFixed(2);
    const songsSizeMB = (songsStats.size / (1024 * 1024)).toFixed(2);

    console.log('\n✅ Backup created successfully!');
    console.log(`📁 Schema File: ${schemaPath} (${schemaSizeMB}MB)`);
    console.log(`📁 Workouts File: ${workoutsPath} (${workoutsSizeMB}MB)`);
    console.log(`📁 Songs File: ${songsPath} (${songsSizeMB}MB)\n`);

    console.log('To restore to Supabase:');
    console.log('1. Go to Supabase Dashboard -> SQL Editor');
    console.log('2. Copy and paste the contents of each file in this order:');
    console.log('   a. Schema file (creates tables)');
    console.log('   b. Workouts file (inserts workout data)');
    console.log('   c. Songs file (inserts song data)');

} catch(error) {
    console.error('Error creating backup:',error);
    process.exit(1);
}