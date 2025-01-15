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
    { name: 'peloton_workouts', file: `peloton_workouts_${timestamp}.sql.gz` },
    { name: 'peloton_detailed', file: `peloton_detailed_${timestamp}.sql.gz` }
];

// Create backup function
function backupDatabase(dbName, backupFile) {
    const backupPath = path.join(BACKUP_DIR, backupFile);
    // Using gzip compression but keeping all data
    const command = `PGPASSWORD=${process.env.DB_PASSWORD} pg_dump -h ${process.env.DB_HOST} \
-U ${process.env.DB_USER} -p ${process.env.DB_PORT} \
-d ${dbName} \
--no-owner --no-acl \
| gzip > ${backupPath}`;

    return new Promise((resolve, reject) => {
        console.log(`📦 Starting backup of ${dbName}...`);
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Error backing up ${dbName}:`, error);
                reject(error);
                return;
            }
            const size = (fs.statSync(backupPath).size / 1024 / 1024).toFixed(2);
            console.log(`✅ Successfully backed up ${dbName} to ${backupFile} (${size} MB)`);
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