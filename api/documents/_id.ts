// api/documents/_id.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession, getSupabase } from '../_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = req.method?.toUpperCase();
  console.log(`[API] Documents/Id request: ${method} ${req.url}`);

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') return res.status(200).end();

  try {
    const employee = await verifySession(req);
    if (!employee) {
      return res.status(401).json({ error: 'Session expired or unauthorized' });
    }

    const supabaseAdmin = getSupabase();
    
    // FALLBACK STRATEGY: Try reading req.query.id first. 
    // If Vercel leaves it empty, split the actual incoming URL to grab the trailing ID token manually.
    let id = req.query.id as string;
    if (!id && req.url) {
      const urlParts = req.url.split('?')[0].split('/');
      id = urlParts[urlParts.length - 1];
    }

    if (!id || id === '_id') {
      return res.status(400).json({ error: 'Valid Document ID parameter string required' });
    }

    // --- EXECUTE DELETE ---
    if (method === 'DELETE') {
      const { error: deleteError } = await supabaseAdmin
        .from('documents')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      return res.status(200).json({ success: true, purgedId: id });
    }

    // --- EXECUTE GET ---
    if (method === 'GET') {
      const { data: document, error: fetchError } = await supabaseAdmin
        .from('documents')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      if (!document) return res.status(404).json({ error: 'Document record not found in database ledger' });

      return res.status(200).json(document);
    }

    return res.status(405).json({ error: `Method ${method} not allowed` });
  } catch (err: any) {
    console.error('[API Error] Documents/Id:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}