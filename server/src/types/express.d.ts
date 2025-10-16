import type { SupabaseClient, User } from '@supabase/supabase-js';

declare global {
	namespace Express {
		interface Request {
			supabase?: SupabaseClient;
			authUser?: User;
			accessToken?: string;
		}
	}
}

export {};
