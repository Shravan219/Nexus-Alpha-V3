import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession, getSupabase } from './_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const employee = await verifySession(req);
  if (!employee) return res.status(200).json([]); // Return empty array instead of 401

  const supabaseAdmin = getSupabase();

  // Get conversationId from either query params or URL path
  const conversationId = (req.query.conversationId as string) || 
                         (req.query.id as string) ||
                         (req.url?.split('/').pop()?.split('?')[0]);

  console.log('Messages request. ConversationId:', conversationId, 'Method:', req.method);

  if (req.method === 'GET') {
    if (!conversationId) {
      return res.status(200).json([]);
    }

    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    console.log('Messages found:', data?.length, 'Error:', error);
    return res.status(200).json(data || []);
  }

  return res.status(200).json([]);
}