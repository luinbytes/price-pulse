import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
}

// Using untyped client for simpler insert/update operations
// Type safety is enforced at component level via TypeScript interfaces
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
