const {createClient} = require('@supabase/supabase-js')

// Replace these with your project URL and service_role key from the Supabase dashboard
const supabaseUrl = 'https://badkkfgwyxqysfszjnxc.supabase.co'
// Get this from Project Settings > API > service_role key (secret)
const supabaseKey = process.env.SUPABASE_KEY

const supabase = createClient(supabaseUrl,supabaseKey)

async function testConnection() {
    try {
        console.log('Attempting to fetch instructors...')
        const {data,error,status,statusText} = await supabase
            .from('instructors')
            .select('*')
            .limit(1)

        if(error) throw error

        console.log('Connection successful!')
        console.log('Status:',status,statusText)
        console.log('Number of rows:',data?.length)
        console.log('Sample data:',data)
    } catch(error) {
        console.error('Error:',error.message)
        if(error.details) console.error('Details:',error.details)
    }
}

testConnection()