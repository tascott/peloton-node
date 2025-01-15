require('dotenv').config();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Create backups directory if it doesn't exist
const BACKUP_DIR = './backups';
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
}

// Get timestamp for backup files
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

// Database configurations
const databases = [
    { name: 'peloton_workouts', file: `peloton_workouts_${timestamp}.sql` },
    { name: 'peloton_detailed', file: `peloton_detailed_${timestamp}.sql` }
];

// Create backup function
function backupDatabase(dbName, backupFile) {
    const backupPath = path.join(BACKUP_DIR, backupFile);
    const command = `PGPASSWORD=${process.env.DB_PASSWORD} pg_dump -h ${process.env.DB_HOST} -U ${process.env.DB_USER} -p ${process.env.DB_PORT} -F p -b -v -f ${backupPath} ${dbName}`;

    return new Promise((resolve, reject) => {
        console.log(`📦 Starting backup of ${dbName}...`);
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Error backing up ${dbName}:`, error);
                reject(error);
                return;
            }
            console.log(`✅ Successfully backed up ${dbName} to ${backupFile}`);
            resolve();
        });
    });
}

// Run backups
async function runBackups() {
    try {
        for (const db of databases) {
            await backupDatabase(db.name, db.file);
        }
        console.log('\n📊 Backup Summary:');
        console.log('Backup location:', path.resolve(BACKUP_DIR));
        console.log('Databases backed up:', databases.map(db => db.name).join(', '));
        console.log('Timestamp:', timestamp);
    } catch (error) {
        console.error('❌ Backup process failed:', error);
        process.exit(1);
    }
}

runBackups();