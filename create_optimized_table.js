require('dotenv').config();
const {Pool} = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: "peloton_detailed",
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});

async function createOptimizedTables() {
    const client = await pool.connect();
    try {
        // Drop existing tables if they exist
        await client.query(`
            DROP TABLE IF EXISTS optimized_songs CASCADE;
            DROP TABLE IF EXISTS optimized_workouts CASCADE;
        `);

        // Create the optimized workouts table
        await client.query(`
            CREATE TABLE optimized_workouts (
                id TEXT PRIMARY KEY,
                title TEXT,
                length INTEGER,
                rating INTEGER,
                duration INTEGER,
                language TEXT,
                location TEXT,
                sold_out BOOLEAN,
                instructor_id TEXT,
                origin_locale TEXT,
                total_ratings INTEGER,
                total_workouts INTEGER,
                overall_estimate NUMERIC,
                original_air_time BIGINT,
                overall_rating_avg NUMERIC,
                difficulty_estimate NUMERIC,
                total_user_workouts INTEGER,
                overall_rating_count INTEGER,
                scheduled_start_time BIGINT,
                difficulty_rating_avg NUMERIC,
                difficulty_rating_count INTEGER,
                average_calories INTEGER,
                average_distance NUMERIC,
                average_avg_power INTEGER,
                average_avg_speed NUMERIC,
                average_total_work INTEGER,
                average_avg_cadence INTEGER,
                average_effort_score NUMERIC,
                average_avg_resistance INTEGER,
                playlist_id TEXT,
                is_power_zone_class BOOLEAN,
                expected_lower_output INTEGER,
                expected_upper_output INTEGER,
                class_type_id TEXT,
                class_type_name TEXT
            );

            CREATE INDEX idx_optimized_workouts_instructor ON optimized_workouts(instructor_id);
            CREATE INDEX idx_optimized_workouts_scheduled ON optimized_workouts(scheduled_start_time);
        `);

        // Create songs table
        await client.query(`
            CREATE TABLE optimized_songs (
                id SERIAL PRIMARY KEY,
                workout_id TEXT REFERENCES optimized_workouts(id),
                title TEXT,
                popularity INTEGER,
                playlist_id TEXT,
                artists TEXT
            );

            CREATE INDEX idx_optimized_songs_workout ON optimized_songs(workout_id);
            CREATE INDEX idx_optimized_songs_title ON optimized_songs(title);
        `);

        // Migrate workout data
        const workoutResult = await client.query(`
            INSERT INTO optimized_workouts
            SELECT
                (full_details->'ride'->>'id')::TEXT as id,
                (full_details->'ride'->>'title')::TEXT as title,
                (full_details->'ride'->>'length')::INTEGER as length,
                (full_details->'ride'->>'rating')::INTEGER as rating,
                (full_details->'ride'->>'duration')::INTEGER as duration,
                (full_details->'ride'->>'language')::TEXT as language,
                (full_details->'ride'->>'location')::TEXT as location,
                (full_details->'ride'->>'sold_out')::BOOLEAN as sold_out,
                (full_details->'ride'->>'instructor_id')::TEXT as instructor_id,
                (full_details->'ride'->>'origin_locale')::TEXT as origin_locale,
                (full_details->'ride'->>'total_ratings')::INTEGER as total_ratings,
                (full_details->'ride'->>'total_workouts')::INTEGER as total_workouts,
                (full_details->'ride'->>'overall_estimate')::NUMERIC as overall_estimate,
                (full_details->'ride'->>'original_air_time')::BIGINT as original_air_time,
                (full_details->'ride'->>'overall_rating_avg')::NUMERIC as overall_rating_avg,
                (full_details->'ride'->>'difficulty_estimate')::NUMERIC as difficulty_estimate,
                (full_details->'ride'->>'total_user_workouts')::INTEGER as total_user_workouts,
                (full_details->'ride'->>'overall_rating_count')::INTEGER as overall_rating_count,
                (full_details->'ride'->>'scheduled_start_time')::BIGINT as scheduled_start_time,
                (full_details->'ride'->>'difficulty_rating_avg')::NUMERIC as difficulty_rating_avg,
                (full_details->'ride'->>'difficulty_rating_count')::INTEGER as difficulty_rating_count,
                (full_details->'averages'->>'average_calories')::INTEGER as average_calories,
                (full_details->'averages'->>'average_distance')::NUMERIC as average_distance,
                (full_details->'averages'->>'average_avg_power')::INTEGER as average_avg_power,
                (full_details->'averages'->>'average_avg_speed')::NUMERIC as average_avg_speed,
                (full_details->'averages'->>'average_total_work')::INTEGER as average_total_work,
                (full_details->'averages'->>'average_avg_cadence')::INTEGER as average_avg_cadence,
                (full_details->'averages'->>'average_effort_score')::NUMERIC as average_effort_score,
                (full_details->'averages'->>'average_avg_resistance')::INTEGER as average_avg_resistance,
                (full_details->'playlist'->>'id')::TEXT as playlist_id,
                (full_details->>'is_power_zone_class')::BOOLEAN as is_power_zone_class,
                (full_details->'target_metrics_data'->'total_expected_output'->>'expected_lower_output')::INTEGER as expected_lower_output,
                (full_details->'target_metrics_data'->'total_expected_output'->>'expected_upper_output')::INTEGER as expected_upper_output,
                (full_details->'class_types'->0->>'id')::TEXT as class_type_id,
                (full_details->'class_types'->0->>'name')::TEXT as class_type_name
            FROM detailed_workouts;
        `);

        // Insert songs with comma-separated artists
        await client.query(`
            INSERT INTO optimized_songs (workout_id, title, popularity, playlist_id, artists)
            SELECT DISTINCT ON (w.id, s->>'title')
                w.id as workout_id,
                s->>'title' as title,
                (s->>'popularity')::INTEGER as popularity,
                full_details->'playlist'->>'id' as playlist_id,
                string_agg(a->>'artist_name', ', ' ORDER BY a->>'artist_name') as artists
            FROM detailed_workouts w
            CROSS JOIN jsonb_array_elements(full_details->'playlist'->'songs') s
            CROSS JOIN jsonb_array_elements(s->'artists') a
            GROUP BY w.id, s->>'title', s->>'popularity', full_details->'playlist'->>'id';
        `);

        console.log(`✅ Successfully created optimized tables`);
        console.log(`✅ Migrated ${workoutResult.rowCount} workouts`);

        // Get count of songs
        const songCount = await client.query('SELECT COUNT(*) FROM optimized_songs');
        console.log(`✅ Migrated ${songCount.rows[0].count} songs`);

    } catch(err) {
        console.error('❌ Error:',err);
    } finally {
        client.release();
    }
}

createOptimizedTables();