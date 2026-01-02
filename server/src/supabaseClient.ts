import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } from './constants/environment';

if (!SUPABASE_URL) {
	throw new Error('Missing SUPABASE_URL environment variable');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
	throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
}
if (!SUPABASE_ANON_KEY) {
	throw new Error('Missing SUPABASE_ANON_KEY environment variable');
}

let serviceClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
	if (serviceClient) return serviceClient;
	serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
			detectSessionInUrl: false,
		},
		global: {
			headers: {
				'X-Client-Info': 'p2picks-server-admin',
			},
		},
	});
	return serviceClient;
}

export function createSupabaseClientForToken(accessToken: string): SupabaseClient {
	if (!accessToken || !accessToken.trim()) {
		throw new Error('Access token required to create scoped Supabase client');
	}
	return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
			detectSessionInUrl: false,
		},
		global: {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'X-Client-Info': 'p2picks-server-user',
			},
		},
	});
}

export type BetProposal = {
	bet_id: string;
	table_id: string;
	nfl_game_id: string | null;
	mode_key: string;
	bet_status: 'active' | 'pending' | 'resolved' | 'washed';
	description: string;
	wager_amount: number;
	time_limit_seconds: number;
	close_time: string | null;
	proposal_time: string;
	winning_choice: string | null;
};
