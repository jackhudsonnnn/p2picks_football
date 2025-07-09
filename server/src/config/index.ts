import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' }); // if .env is in project root
// Or dotenv.config(); if .env is in server directory

export const config = {
  port: process.env.PORT || 3001,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  // Add other configurations
};

if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
  console.warn(
    'Server Warning: Supabase URL or Service Role Key is not defined in environment variables. ' +
    'Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
  );
}
