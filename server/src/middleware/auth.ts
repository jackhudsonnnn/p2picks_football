import type { NextFunction, Request, Response } from 'express';
import { createSupabaseClientForToken } from '../supabaseClient';

function extractBearerToken(req: Request): string | null {
	const header = req.headers.authorization || req.headers.Authorization;
	const value = typeof header === 'string' ? header : Array.isArray(header) ? header[0] : null;
	if (!value) return null;
	const [scheme, token] = value.split(' ');
	if (!scheme || scheme.toLowerCase() !== 'bearer') return null;
	return token?.trim() || null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const token = extractBearerToken(req);
		if (!token) {
			res.status(401).json({ error: 'Authorization token required' });
			return;
		}

		const supabase = createSupabaseClientForToken(token);
		const { data, error } = await supabase.auth.getUser();
		if (error || !data?.user) {
			res.status(401).json({ error: 'Invalid or expired session' });
			return;
		}

		req.supabase = supabase;
		req.authUser = data.user;
		req.accessToken = token;

		next();
	} catch (err) {
		console.error('[authMiddleware] authentication failed', err);
		res.status(401).json({ error: 'Authentication failed' });
	}
}
