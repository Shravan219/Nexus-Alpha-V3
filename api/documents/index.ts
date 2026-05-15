// api/documents/index.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession, getSupabase } from '../_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = req.method?.toUpperCase();
  const id = req.query.id as string; // Reads ?id=XXXX from the URL cleanly

  console.log(`[API] Documents Index request: ${method} ${id ? `ID: ${id}` : ''}`);

  // CORS Headers Configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. Core Session Verification
    const employee = await verifySession(req);
    if (!employee) return res.status(401).json({ error: 'Session expired or unauthorized' });

    const supabaseAdmin = getSupabase();

    // --- HANDLE DELETE (Purging a file via ?id=UUID) ---
    if (method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Document ID query parameter required (?id=...)' });

      const { error: deleteError } = await supabaseAdmin
        .from('documents')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      return res.status(200).json({ success: true, message: 'Document wiped successfully' });
    }

    // --- HANDLE GET (Fetch list or single record) ---
    if (method === 'GET') {
      if (id) {
        const { data: document, error: fetchError } = await supabaseAdmin
          .from('documents')
          .select('*')
          .eq('id', id)
          .single();

        if (fetchError) throw fetchError;
        if (!document) return res.status(404).json({ error: 'Document not found' });
        return res.status(200).json(document);
      }

      // Default: Load all available workspace assets for the Knowledge Vault
      const { data: documents, error: listError } = await supabaseAdmin
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (listError) throw listError;
      return res.status(200).json(documents || []);
    }

    return res.status(405).json({ error: `Method ${method} not allowed` });
  } catch (err: any) {
    console.error('[API Error] Documents Index:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}