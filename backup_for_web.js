require('dotenv').config();
const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

// Create backups directory if it doesn't exist
const backupsDir = './backups';
if(!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir);
}

// Generate timestamp for backup file
const timestamp = new Date().toISOString().replace(/[:.]/g,'-');
const schemaPath = path.join(backupsDir,`optimized_schema_${timestamp}.sql`);
const workoutsPath = path.join(backupsDir,`optimized_workouts_${timestamp}.sql`);
const songsPath = path.join(backupsDir,`optimized_songs_${timestamp}.sql`);

try {
    // Create schema backup with transaction
    console.log('Creating schema backup...');
    const schemaCommand = `PGPASSWORD=${process.env.DB_PASSWORD} pg_dump -h ${process.env.DB_HOST} -U ${process.env.DB_USER} -d peloton_detailed -t optimized_workouts -t optimized_songs --schema-only --no-owner --no-acl --no-comments -f ${schemaPath}`;
    execSync(schemaCommand);

    // Add transaction boundaries and safe drops to schema
    let schemaContent = fs.readFileSync(schemaPath,'utf8');
    schemaContent = `BEGIN;
DROP TABLE IF EXISTS public.optimized_songs;
DROP TABLE IF EXISTS public.optimized_workouts;

${schemaContent}COMMIT;\n`;
    fs.writeFileSync(schemaPath,schemaContent);

    // Create separate backup for workouts
    console.log('Creating workouts backup...');
    const workoutsCommand = `PGPASSWORD=${process.env.DB_PASSWORD} pg_dump -h ${process.env.DB_HOST} -U ${process.env.DB_USER} -d peloton_detailed -t optimized_workouts --data-only --no-owner --no-acl --no-comments -f ${workoutsPath}`;
    execSync(workoutsCommand);

    // Add transaction boundaries to workouts
    let workoutsContent = fs.readFileSync(workoutsPath,'utf8');
    workoutsContent = `BEGIN;\n${workoutsContent}COMMIT;\n`;
    fs.writeFileSync(workoutsPath,workoutsContent);

    // Create separate backup for songs
    console.log('Creating songs backup...');
    const songsCommand = `PGPASSWORD=${process.env.DB_PASSWORD} pg_dump -h ${process.env.DB_HOST} -U ${process.env.DB_USER} -d peloton_detailed -t optimized_songs --data-only --no-owner --no-acl --no-comments -f ${songsPath}`;
    execSync(songsCommand);

    // Add transaction boundaries to songs
    let songsContent = fs.readFileSync(songsPath,'utf8');
    songsContent = `BEGIN;\n${songsContent}COMMIT;\n`;
    fs.writeFileSync(songsPath,songsContent);

    const schemaStats = fs.statSync(schemaPath);
    const workoutsStats = fs.statSync(workoutsPath);
    const songsStats = fs.statSync(songsPath);

    const schemaSizeMB = (schemaStats.size / (1024 * 1024)).toFixed(2);
    const workoutsSizeMB = (workoutsStats.size / (1024 * 1024)).toFixed(2);
    const songsSizeMB = (songsStats.size / (1024 * 1024)).toFixed(2);

    console.log('✅ Backup created successfully!');
    console.log(`📁 Schema File: ${schemaPath} (${schemaSizeMB}MB)`);
    console.log(`📁 Workouts File: ${workoutsPath} (${workoutsSizeMB}MB)`);
    console.log(`📁 Songs File: ${songsPath} (${songsSizeMB}MB)\n`);

    console.log('To restore to Supabase:');
    console.log('1. Go to Supabase Dashboard -> SQL Editor');
    console.log('2. Copy and paste the contents of each file in this order:');
    console.log('   a. Schema file (creates tables)');
    console.log('   b. Workouts file (inserts workout data)');
    console.log('   c. Songs file (inserts song data)\n');

    console.log('Each file has transaction boundaries (BEGIN/COMMIT) for safety.');
    console.log('If you still want to use psql, here are the commands:');
    console.log(`psql "postgresql://postgres.badkkfgwyxqysfszjnxc:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres" -f ${schemaPath}`);
    console.log(`psql "postgresql://postgres.badkkfgwyxqysfszjnxc:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres" -f ${workoutsPath}`);
    console.log(`psql "postgresql://postgres.badkkfgwyxqysfszjnxc:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres" -f ${songsPath}\n`);

} catch(error) {
    console.error('❌ Error:',error.message);
    process.exit(1);
}