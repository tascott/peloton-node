require('dotenv').config()
const {createClient} = require('@supabase/supabase-js')
const {Pool} = require('pg')

const supabaseUrl = 'https://badkkfgwyxqysfszjnxc.supabase.co'
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl,supabaseKey)

// Local database connection
const localPool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME
})

async function migrateData() {
    try {
        // Get most recent workout from Supabase
        console.log('\nFetching most recent workout from Supabase...')
        const { data: latestWorkout, error: workoutError } = await supabase
            .from('web_workouts')
            .select('scheduled_time')
            .order('scheduled_time', { ascending: false })
            .limit(1)
        
        if(workoutError) throw workoutError
        const latestWorkoutTime = latestWorkout?.[0]?.scheduled_time || '1970-01-01'
        console.log(`Most recent workout in Supabase: ${latestWorkoutTime}`)

        // Get newer workouts from local DB
        console.log('\nFetching newer workouts from local database...')
        const workoutsResult = await localPool.query(`
            SELECT 
                id,
                title,
                duration,
                instructor_id,
                description,
                fitness_discipline,
                scheduled_time,
                difficulty_rating_avg
            FROM public.detailed_workouts
            WHERE scheduled_time > $1::timestamp
            ORDER BY scheduled_time ASC
        `, [latestWorkoutTime])
        
        const newWorkoutIds = workoutsResult.rows.map(w => w.id)
        console.log(`Found ${workoutsResult.rows.length} new workouts`)

        // Try to insert workouts (some might already exist)
        if (workoutsResult.rows.length > 0) {
            console.log('Inserting any missing workouts into Supabase...')
            const {error: insertError} = await supabase
                .from('web_workouts')
                .insert(workoutsResult.rows, {
                    onConflict: 'id',
                    ignoreDuplicates: true
                })

            if(insertError) throw insertError
            console.log(`Processed ${workoutsResult.rows.length} workouts`)
        }

        // Get songs for these workouts that aren't in Supabase yet
        if (newWorkoutIds.length > 0) {
            console.log('\nFetching existing songs from Supabase for these workouts...')
            const { data: existingSongs, error: existingSongsError } = await supabase
                .from('songs')
                .select('workout_id, title')
                .in('workout_id', newWorkoutIds)
            
            if(existingSongsError) throw existingSongsError
            
            // Create a Set of workout_id:title for quick lookup
            const existingSongKeys = new Set(
                (existingSongs || []).map(s => `${s.workout_id}:${s.title}`)
            )

            // Get all songs for these workouts from local DB
            console.log('Fetching songs from local database...')
            const songsResult = await localPool.query(`
                SELECT 
                    workout_id,
                    title,
                    artist_names,
                    image_url,
                    playlist_order
                FROM songs 
                WHERE workout_id = ANY($1)
                ORDER BY workout_id, playlist_order
            `, [newWorkoutIds])

            // Filter out songs that already exist in Supabase
            const newSongs = songsResult.rows.filter(
                s => !existingSongKeys.has(`${s.workout_id}:${s.title}`)
            )

            console.log(`Found ${newSongs.length} new songs to add (out of ${songsResult.rows.length} total)`)

            if (newSongs.length > 0) {
                console.log('Inserting new songs into Supabase...')
                const {error: insertSongError} = await supabase
                    .from('songs')
                    .insert(newSongs)

                if(insertSongError) throw insertSongError
                console.log(`Successfully added ${newSongs.length} songs`)
            }
        }

        console.log('\nMigration completed successfully!')
    } catch(error) {
        console.error('Migration failed:',error.message)
        if(error.details) console.error('Details:',error.details)
    } finally {
        await localPool.end()
    }
}

migrateData()