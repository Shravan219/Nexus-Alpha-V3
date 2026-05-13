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

  const employee = await verifySession(req);
  if (!employee) {
    console.warn(`[API] Unauthorized access attempt or session expired. Token from header: ${req.headers.authorization?.substring(0, 15)}...`);
    return res.status(401).json({ error: 'Session expired or unauthorized' });
  }

  // Only admins can delete documents
  if (employee.role !== 'admin') {
    console.warn(`[API] Forbidden: Employee ${employee.employee_id} attempted deletion without admin role.`);
    return res.status(403).json({ error: 'Unauthorized: Admin access required' });
  }

  const supabaseAdmin = getSupabase();
  const id = req.query.id as string;

  if (method === 'DELETE') {
    try {
      if (!id) return res.status(400).json({ error: 'Document ID required' });

      // 1. Get document to find its storage path (if we were cleaning storage)
      // For now, focus on DB deletion which triggers cascade for chunks
      const { error: deleteError } = await supabaseAdmin
        .from('documents')
        .delete()
        .eq('id', id);

      if (deleteError) {
        throw new Error(`Deletion failed: ${deleteError.message}`);
      }

      return res.status(200).json({ success: true });
    } catch (err: any) {
      console.error('Delete Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
