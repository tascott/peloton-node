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
        // Debug: Check connection and list tables
        console.log('Checking local database connection...')
        console.log('Database:',process.env.DB_NAME)

        const tablesResult = await localPool.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
        `)

        console.log('Available tables:',tablesResult.rows.map(r => r.table_name))

        // First migrate workouts
        console.log('\nFetching workouts from local database...')
        const workoutsResult = await localPool.query('SELECT * FROM public.detailed_workouts')
        console.log(`Found ${workoutsResult.rows.length} workouts`)

        console.log('Inserting workouts into Supabase...')
        const {data: workoutsData,error: workoutsError} = await supabase
            .from('detailed_workouts')
            .insert(workoutsResult.rows)
            .select()

        if(workoutsError) throw workoutsError
        console.log(`Successfully inserted ${workoutsData.length} workouts`)

        // Then migrate songs
        console.log('\nFetching songs from local database...')
        const songsResult = await localPool.query('SELECT * FROM public.songs')
        console.log(`Found ${songsResult.rows.length} songs`)

        console.log('Inserting songs into Supabase...')
        const {data: songsData,error: songsError} = await supabase
            .from('songs')
            .insert(songsResult.rows)
            .select()

        if(songsError) throw songsError
        console.log(`Successfully inserted ${songsData.length} songs`)

        console.log('Migration completed successfully!')
    } catch(error) {
        console.error('Migration failed:',error.message)
        if(error.details) console.error('Details:',error.details)
    } finally {
        await localPool.end()
    }
}

migrateData()