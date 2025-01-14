# Peloton Music API

A Node.js application that fetches and stores music data from Peloton workouts.

## Features

- Fetches workout data from the Peloton API
- Stores workout and music information in a PostgreSQL database
- Creates JSON backups of workout data
- Implements rate limiting to respect API constraints
- Tracks progress and maintains session state

## Logic
- Fetches every available workout for *cycling* from the Peloton API

## Prerequisites

- Node.js
- PostgreSQL database
- Peloton account credentials

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Create a `.env` file with the following variables:
```
DB_USER=your_db_user
DB_HOST=your_db_host
DB_NAME=your_db_name
DB_PASSWORD=your_db_password
DB_PORT=your_db_port
```

## Directory Structure

- `/workouts_list` - Contains JSON backups of workout lists
- `/workout_details` - Contains detailed workout information
- `session.json` - Stores the current session ID
- `progress.json` - Tracks the most recently fetched workout ID
- `index.js` - Main application file
- `test_db.js` - Database testing utilities

## Usage

Run the application:
```bash
node index.js
```

The application will:
1. Connect to the PostgreSQL database
2. Load any existing session
3. Fetch new workouts from Peloton
4. Process workout details and music data
5. Store data in the database
6. Create JSON backups

## API Endpoints Used

- `https://api.onepeloton.com/api/v2/ride/archived?browse_category=cycling&limit=50&page=0` - Main Peloton API endpoint for rides. It returns a list of objects as seen in `exampleListData.json`
- `https://api.onepeloton.com/api/ride/{id}` - Returns an indivudual ride object. It returns a list of objects as seen in `exampleIndividualRideData.json`. The instructor name is located at `instructor.name`. The songs are at `playlist.songs`. Within the playlist.songs array, the artist name is at `artists[0].artist_name` and the song name is at `title`.

## Configuration

- `RATE_LIMIT_DELAY`: 1 second (configurable delay between API requests to respect rate limits)
- `BATCH_SIZE`: 100 (number of workouts processed in each JSON backup batch)

## Dependencies

- `axios`: ^1.7.9 - HTTP client for API requests
- `dotenv`: ^16.4.7 - Environment variable management
- `pg`: ^8.13.1 - PostgreSQL client

## Error Handling

The application includes:
- Session management and recovery
- Progress tracking to resume interrupted operations
- API rate limiting
- Database connection error handling

## Data Backup

Workout data is backed up in two ways:
1. PostgreSQL database storage
2. JSON file backups in the `workouts_list` and `workout_details` directories
