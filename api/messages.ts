import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession, supabaseAdmin } from './_auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const employee = await verifySession(req);
  if (!employee) return res.status(401).json({ error: 'Session expired' });

  const conversationId = req.query.conversationId as string;

  if (req.method === 'GET') {
    const { data } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    return res.status(200).json(data || []);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
