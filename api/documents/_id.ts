import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession, getSupabase } from '../_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = req.method?.toUpperCase();
  console.log(`[API] Documents/Id request: ${method} ${req.url}`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') return res.status(200).end();

  try {
    const employee = await verifySession(req);
    if (!employee) {
      console.warn(`[API] Unauthorized: Token ${req.headers.authorization?.substring(0, 10)}...`);
      return res.status(401).json({ error: 'Session expired or unauthorized' });
    }

    // Only admins can delete documents
    if (employee.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Admin access required' });
    }

    const supabaseAdmin = getSupabase();
    const id = req.query.id as string;

    if (method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Document ID required' });

      const { error: deleteError } = await supabaseAdmin
        .from('documents')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: `Method ${method} not allowed on document detail (ID: ${id})` });
  } catch (err: any) {
    console.error('[API Error] Documents/Id:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
