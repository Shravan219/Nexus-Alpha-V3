// api/verify-license.ts (Vercel Node.js Serverless Function)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Handle CORS Preflight
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
    const origin = req.headers.origin || ''; // Automatically captures the client's URL

    // 2. Connect to your Master Admin Database
    const supabaseAdmin = createClient(
      process.env.MASTER_SUPABASE_URL!,
      process.env.MASTER_SUPABASE_SERVICE_ROLE_KEY! // Kept safe on your Vercel dashboard
    );

    // 3. Query the license key
    const { data: license, error } = await supabaseAdmin
      .from('licenses')
      .select('is_active, allowed_domain')
      .eq('license_key', licenseKey)
      .single();

    if (error || !license) {
      return res.status(404).json({ valid: false, reason: 'License not found' });
    }

    if (!license.is_active) {
      return res.status(403).json({ valid: false, reason: 'License suspended' });
    }

    // 4. Domain Check to prevent license theft/sharing
    // Exclude localhost checking during development if needed
    if (license.allowed_domain !== 'ANY' && !origin.includes(license.allowed_domain) && !origin.includes('localhost')) {
      return res.status(403).json({ valid: false, reason: 'Domain verification failed' });
    }

    return res.status(200).json({ valid: true });

  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}