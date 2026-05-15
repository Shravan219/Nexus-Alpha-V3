// api/verify-license.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS handles
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { licenseKey } = req.body;
    // Capture the exact host running the app (e.g., nexus.client.com)
    const host = req.headers.host || ''; 

    // Connect to your central master Supabase instance 
    const supabaseAdmin = createClient(
      process.env.MASTER_SUPABASE_URL!,
      process.env.MASTER_SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: license, error } = await supabaseAdmin
      .from('licenses')
      .select('is_active, allowed_domain')
      .eq('license_key', licenseKey)
      .single();

    if (error || !license) {
      return res.status(404).json({ valid: false, reason: 'License key invalid.' });
    }

    if (!license.is_active) {
      return res.status(403).json({ valid: false, reason: 'License suspended.' });
    }

    // Match against the deployment host
    if (license.allowed_domain !== 'ANY' && !host.includes(license.allowed_domain) && !host.includes('localhost')) {
      return res.status(403).json({ valid: false, reason: 'Domain unauthorized.' });
    }

    return res.status(200).json({ valid: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}