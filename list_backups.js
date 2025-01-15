const fs = require('fs');
const path = require('path');

const BACKUP_DIR = './backups';

// Check if backups directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    console.log('❌ No backups directory found.');
    process.exit(0);
}

// Get all backup files
const files = fs.readdirSync(BACKUP_DIR)
    .filter(file => file.endsWith('.sql.gz'))
    .sort()
    .reverse(); // Most recent first

if (files.length === 0) {
    console.log('❌ No backup files found.');
    process.exit(0);
}

// Group files by timestamp
const backupGroups = {};
files.forEach(file => {
    // Extract timestamp from filename
    const match = file.match(/(.*?)_(\d{4}-\d{2}-\d{2}T.*?)\.sql\.gz$/);
    if (match) {
        const [_, dbName, timestamp] = match;
        if (!backupGroups[timestamp]) {
            backupGroups[timestamp] = [];
        }
        backupGroups[timestamp].push({
            dbName,
            file,
            size: (fs.statSync(path.join(BACKUP_DIR, file)).size / 1024 / 1024).toFixed(2) + ' MB'
        });
    }
});

// Display backups
console.log('📂 Available Database Backups:\n');

Object.entries(backupGroups).forEach(([timestamp, files], index) => {
    // Parse the ISO timestamp parts
    const match = timestamp.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
    if (match) {
        const [_, year, month, day, hour, minute, second, ms] = match;
        const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}Z`;
        const date = new Date(dateStr);

        console.log(`${index + 1}. 📅 ${date.toLocaleString()} (UTC)`);
    } else {
        console.log(`${index + 1}. 📅 ${timestamp} (Unparseable date)`);
    }

    files.forEach(({dbName, file, size}) => {
        console.log(`   - ${dbName}: ${file} (${size})`);
    });

    // Show restore commands
    console.log('\n   Restore commands:');
    files.forEach(({dbName, file}) => {
        console.log(`   gunzip -c ./backups/${file} | psql -U $DB_USER -d ${dbName}`);
    });
    console.log(''); // Empty line between groups
});