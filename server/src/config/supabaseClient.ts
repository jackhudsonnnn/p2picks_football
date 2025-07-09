import { createClient } from '@supabase/supabase-js';
import { config } from './index.js';

let supabaseAdmin = null;

if (config.supabaseUrl && config.supabaseServiceRoleKey) {
  supabaseAdmin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      // It's generally recommended to use the service_role key for server-side admin tasks,
      // and it doesn't require autoRefreshToken or persistSession.
      // If you were to use a user's JWT for row-level security checks on the server,
      // those options might be relevant, but typically not for an admin client.
      autoRefreshToken: false,
      persistSession: false,
      // detectSessionInUrl: false, // Usually not needed for server client
    }
  });
  console.log("Server-side Supabase admin client initialized.");
} else {
  console.warn(
    'Server-side Supabase admin client not initialized due to missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
    'Ensure these are set in your server environment variables (e.g., in a .env file at the server root, loaded by dotenv).'
  );
}

export { supabaseAdmin };
