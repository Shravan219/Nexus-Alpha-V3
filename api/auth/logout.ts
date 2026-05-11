import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) await supabaseAdmin.from('sessions').delete().eq('id', token);
  return res.status(200).json({ success: true });
}
