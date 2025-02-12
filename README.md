# Peloton Music API

A Node.js application that extracts and stores music playlists from Peloton workouts, implementing robust error handling, rate limiting, and data persistence.

## Features

- Authenticates with Peloton's API using session-based authentication
- Fetches paginated workout data with configurable batch sizes
- Maintains persistent session tokens and request progress
- Stores normalized workout and music data in PostgreSQL
- Handles rate limiting with configurable delays and jitter

## Technical Architecture

### File Structure
```
├── auth.js                 # Peloton authentication handling
├── db.js                   # Database operations
├── fetchWorkoutDetails.js  # Core API fetching logic
├── fetchDetailedWorkouts.js# Detailed workout processing
├── saveWorkouts.js         # Initial workout saving logic
└── session.json           # Stores authentication session
```

### Database Architecture
The application uses a single PostgreSQL database (`peloton_detailed`) with normalized tables for efficient data storage and retrieval:

1. Detailed Workouts Table
   - Stores comprehensive workout information
   - Contains both basic metadata and detailed information
   - Links to instructors and songs tables

2. Instructors Table
   - Stores instructor information
   - Referenced by detailed workouts table

3. Songs Table
   - Stores playlist information for each workout
   - Includes text search capabilities for song and artist lookup

### Data Flow
1. Initial Workout List Collection (`saveWorkouts.js`)
   - Fetches paginated workout lists (50 workouts per page)
   - Extracts basic workout metadata (id, title, etc.)
   - Stores in `detailed_workouts` table
   - Skips workouts that already exist in the database

2. Detailed Workout Processing (`fetchDetailedWorkouts.js`)
   - Uses `fetchWorkoutDetails.js` for API calls
   - Identifies workouts without full details in the database
   - Fetches detailed workout data for each workout
   - Updates the database with:
     - Instructor information
     - Detailed workout metadata
     - Song playlists

### Database Schema

```sql
-- Instructors table
CREATE TABLE instructors (
    id TEXT PRIMARY KEY,
    name TEXT,
    image_url TEXT
);

-- Detailed workouts table
CREATE TABLE detailed_workouts (
    id TEXT PRIMARY KEY,
    title TEXT,
    duration INTEGER,
    image_url TEXT,
    instructor_id TEXT REFERENCES instructors(id),
    description TEXT,
    fitness_discipline TEXT,
    scheduled_time TIMESTAMP,
    difficulty_rating_avg NUMERIC,
    full_details JSONB
);

-- Songs table with text search capabilities
CREATE TABLE songs (
    id SERIAL PRIMARY KEY,
    workout_id TEXT REFERENCES detailed_workouts(id) ON DELETE CASCADE,
    title TEXT,
    artist_names TEXT,
    image_url TEXT,
    playlist_order INTEGER
);

-- Indexes for performance
CREATE INDEX idx_songs_artist_names ON songs USING gin (artist_names gin_trgm_ops);
CREATE INDEX idx_songs_title ON songs(title);
CREATE INDEX idx_workouts_scheduled_time ON detailed_workouts(scheduled_time);
CREATE INDEX idx_workouts_instructor ON detailed_workouts(instructor_id);
```

### Authentication Flow
- Uses Peloton's session-based auth system
- Stores session tokens in `session.json` with auto-refresh
- Implements token rotation on 401 responses

### Processing Flow Example
```sql
-- 1. After initial workout list fetch
INSERT INTO detailed_workouts (id, title, created_at)
VALUES ('123', 'Morning Ride', '2024-03-15');

-- 2. Query for unprocessed workouts
SELECT id FROM detailed_workouts WHERE full_details IS NULL;

-- 3. After fetching workout details
UPDATE detailed_workouts
SET
    instructor_id = 'instructor-123',
    duration = 1800,
    full_details = '{"key": "value"}'
WHERE id = '123';

-- 4. Insert associated songs
INSERT INTO songs (workout_id, title, artist)
VALUES ('123', 'Song Title', 'Artist Name');
```

## Prerequisites

- Node.js 14+
- PostgreSQL 12+
- Peloton account credentials (email and password)

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Set up PostgreSQL database:
```sql
CREATE DATABASE peloton_detailed;
```

4. Configure environment variables in `.env`:
```env
DB_USER=your_db_user
DB_HOST=your_db_host
DB_PASSWORD=your_db_password
DB_PORT=your_db_port
PELOTON_USERNAME=your_peloton_email    # Required for authentication
PELOTON_PASSWORD=your_peloton_password # Required for authentication
```

## Workflow

The application works in two steps:

### 1. Initial Authentication & Workout List Collection
First, you need to authenticate with Peloton and fetch the latest workout list:
```bash
node saveWorkouts.js
```
This will:
- Authenticate with Peloton using your credentials
- Create/update `session.json` with your session token
- Fetch all new workouts from Peloton's API
- Save basic workout info to the `detailed_workouts` table
- Stop when it reaches workouts that are already in the database

### 2. Detailed Workout Processing
After collecting the workout list, fetch detailed information for each workout:
```bash
node fetchDetailedWorkouts.js
```
This will:
- Use the session token from `session.json`
- Check `detailed_workouts` table for unprocessed workouts
- Fetch detailed information for each new workout
- Save complete workout data, instructor info, and song playlists to the database

### Session Token Management
- The session token is automatically managed in `session.json`
- If authentication fails, delete `session.json` and run `saveWorkouts.js` again to get a new token
- Tokens typically last several days but may expire
- If you get authentication errors, simply delete `session.json` and run `saveWorkouts.js` again

### Typical Usage Pattern
1. Run `node saveWorkouts.js` periodically to fetch new workouts
2. Run `node fetchDetailedWorkouts.js` after to process any new workouts
3. If either command fails with authentication errors:
   - Delete `session.json`
   - Run `node saveWorkouts.js` to get a new session token
   - Try your original command again

## Usage

```bash
# Fetch and save new workouts
node saveWorkouts.js          # Fetches and saves new workouts to detailed_workouts
                             # Automatically stops when reaching already saved workouts

# Process detailed workout information
node fetchDetailedWorkouts.js                    # Process all unprocessed workouts one by one
node fetchDetailedWorkouts.js --force            # Reprocess all workouts, even if already processed
```

### Rate Limiting & Batch Processing

#### Initial Collection (`saveWorkouts.js`)
- Fetches workouts in pages of 50 (API limit)
- 2-second delay between page requests
- Checks for duplicates before saving
- Stops automatically when reaching previously saved workouts

#### Detailed Processing (`fetchDetailedWorkouts.js`)
- Default: Processes one workout at a time
- Configurable batch size (--batch-size)
- Concurrent processing option (--concurrent)
- 1-second delay between individual workout requests
- Transaction-based saving to ensure data consistency

## Core Components

### Authentication (`auth.js`)
- Handles Peloton API authentication
- Manages session token lifecycle
- Implements token refresh logic

### Database Operations (`db.js`)
- Manages PostgreSQL connection pool for `peloton_detailed`
- Handles transaction management for workout data
- Implements batch inserts for workout lists

### API Integration
- `fetchWorkoutDetails.js`: Core API fetching logic for individual workouts
- `fetchDetailedWorkouts.js`: Orchestrates detailed data collection and storage
- Implements rate limiting and error handling

## API Endpoints

### Workout List Endpoint
```
GET https://api.onepeloton.com/api/v2/ride/archived
Query Parameters:
- browse_category: "cycling"
- limit: 50 (max)
- page: 0-n
```

### Detailed Workout Endpoint
```
GET https://api.onepeloton.com/api/ride/{id}
Response Structure:
- instructor.name: Instructor information
- playlist.songs[]: Array of song objects
  - artists[0].artist_name: Primary artist
  - title: Song title
```

## Configuration

### Rate Limiting
- Default delay: 1000ms between requests

### Batch Processing
- Workout list batch size: 50 (API self-imposed limit)
- Detail processing batch size: 100 (Also a self-imposed limit)

## Error Handling
- Authentication errors: Auto-refresh of session tokens
- Progress tracking: Resume-able operations

## Data Storage

### Database
- Primary storage in PostgreSQL

### Database Backups
To backup the database (creates compressed SQL dumps in the `backups` directory):
```bash
node backup_dbs.js
```

This will:
- Create compressed timestamped backups of the database
- Store them locally in `./backups/` directory (not version controlled)
- Include ALL data (including complete JSONB API responses)
- Use gzip compression for efficient storage

To list available backups and get restore commands:
```bash
node list_backups.js
```
This will show:
- All available local backups grouped by timestamp
- File sizes
- Ready-to-use restore commands for each backup

Note: The backups include the full API response data in the `full_details` JSONB column. This ensures you can:
- Extract new data points in future iterations
- Preserve historical workout data that might be removed from Peloton
- Maintain a record of the exact API response format
- Recover all data even if the Peloton API changes

Make sure to add `backups/` to your `.gitignore` to prevent committing backup files to version control.

## Dependencies

- `axios`: ^1.7.9 - HTTP client with interceptors
- `dotenv`: ^16.4.7 - Environment configuration
- `pg`: ^8.13.1 - PostgreSQL client
- `fs-extra`: ^11.1.0 - Enhanced file operations
