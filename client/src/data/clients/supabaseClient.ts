import { createClient } from '@supabase/supabase-js';
import type { Database } from '@data/types/database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
console.info('Supabase URL', supabaseUrl);
console.info('Supabase anon key defined?', Boolean(supabaseAnonKey));

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase URL or Anon Key is missing. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file in the client directory.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
