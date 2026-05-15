// api/documents/_id.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession, getSupabase } from '../_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = req.method?.toUpperCase();
  console.log(`[API] Documents/Id request: ${method} ${req.url}`);

  // Secure CORS Headers Configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle Preflight Request
  if (method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. Session and Security Verification
    const employee = await verifySession(req);
    if (!employee) {
      console.warn(`[API] Unauthorized: Token ${req.headers.authorization?.substring(0, 10)}...`);
      return res.status(401).json({ error: 'Session expired or unauthorized' });
    }

    const supabaseAdmin = getSupabase();
    const id = req.query.id as string;

    if (!id) {
      return res.status(400).json({ error: 'Document ID required' });
    }

    // 2. Core Operational Routing based on HTTP Method

    // --- HANDLE DELETE (Strictly Secure: Admin Only) ---
    if (method === 'DELETE') {
      if (employee.role !== 'admin') {
        console.warn(`[API Security Notice] Non-admin user (${employee.id}) attempted deletion of document: ${id}`);
        return res.status(403).json({ error: 'Unauthorized: Admin access required to delete documents' });
      }

      const { error: deleteError } = await supabaseAdmin
        .from('documents')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      return res.status(200).json({ success: true });
    }

    // --- HANDLE GET (Accessible by All Verified Roles) ---
    if (method === 'GET') {
      const { data: document, error: fetchError } = await supabaseAdmin
        .from('documents')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      if (!document) return res.status(404).json({ error: 'Document not found' });

      return res.status(200).json(document);
    }

    // 3. Fallback for unexpected HTTP Operations
    return res.status(405).json({ error: `Method ${method} not allowed on document detail (ID: ${id})` });
  } catch (err: any) {
    console.error('[API Error] Documents/Id:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}