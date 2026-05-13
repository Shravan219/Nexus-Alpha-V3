import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = req.method?.toUpperCase();
  if (method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const supabaseAdmin = getSupabase();
      await supabaseAdmin.from('sessions').delete().eq('id', token);
    }
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[API Error] Logout:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
