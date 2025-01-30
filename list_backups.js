require('dotenv').config();
const fs = require('fs');
const path = require('path');

const BACKUP_DIR = './backups';

// Function to format file size
function formatSize(bytes) {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

// Function to extract timestamp from filename
function extractTimestamp(filename) {
    const match = filename.match(/peloton_detailed_(.+)\.sql\.gz$/);
    return match ? match[1] : null;
}

// Function to group backups by timestamp
function groupBackups() {
    const files = fs.readdirSync(BACKUP_DIR)
        .filter(file => file.endsWith('.sql.gz'))
        .filter(file => file.startsWith('peloton_detailed_'));

    const backups = files.map(file => {
        const timestamp = extractTimestamp(file);
        if (!timestamp) return null;

        const stats = fs.statSync(path.join(BACKUP_DIR, file));
        return {
            timestamp,
            file,
            size: stats.size
        };
    }).filter(Boolean);

    // Sort by timestamp descending
    return backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// Main function to list backups
function listBackups() {
    console.log('📂 Available Database Backups:\n');

    const backups = groupBackups();
    
    backups.forEach((backup, index) => {
        const date = new Date(backup.timestamp.replace(/-/g, ':').replace('T', ' ').slice(0, -1) + 'Z');
        
        console.log(`${index + 1}. 📅 ${date.toLocaleString('en-US', { timeZone: 'UTC' })} (UTC)`);
        console.log(`   - peloton_detailed: ${backup.file} (${formatSize(backup.size)})`);
        
        console.log('\n   Restore command:');
        console.log(`   gunzip -c ./backups/${backup.file} | psql -U $DB_USER -d peloton_detailed`);
        console.log('');
    });
}

listBackups();