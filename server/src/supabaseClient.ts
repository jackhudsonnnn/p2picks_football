import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './config/env';

// Validation now handled by Zod schema in config/env.ts on startup

let serviceClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
	if (serviceClient) return serviceClient;
	serviceClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
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
	return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
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
	league_game_id: string;
	league: 'U2Pick' | 'NFL' | 'NBA' | 'MLB' | 'NHL' | 'NCAAF';
	mode_key: string;
	bet_status: 'active' | 'pending' | 'resolved' | 'washed';
	description: string;
	wager_amount: number;
	time_limit_seconds: number;
	close_time: string | null;
	proposal_time: string;
	winning_choice: string | null;
};
