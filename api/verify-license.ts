// api/verify-license.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { license_key, domain } = req.body;
    // Fallback to headers if domain not provided in body
    const requestDomain = domain || req.headers.host || ''; 

    // Connect to your central master Supabase instance 
    // Uses SERVICE_ROLE key which is hidden from the client
    const supabaseAdmin = createClient(
      process.env.MASTER_SUPABASE_URL!,
      process.env.MASTER_SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: license, error } = await supabaseAdmin
      .from('licenses')
      .select('is_active, allowed_domain')
      .eq('license_key', license_key)
      .single();

    if (error || !license) {
      return res.status(404).json({ valid: false, reason: 'License key not found or invalid.' });
    }

    if (!license.is_active) {
      return res.status(403).json({ valid: false, reason: 'License is currently inactive or suspended.' });
    }

    // Match against the provided or detected domain
    const allowed = license.allowed_domain;
    if (allowed !== 'ANY') {
      const cleanHost = requestDomain.replace(/^https?:\/\//, '').split(':')[0];
      if (!cleanHost.includes(allowed) && !cleanHost.includes('localhost')) {
        return res.status(403).json({ valid: false, reason: 'Domain mismatch: this license is not authorized for this environment.' });
      }
    }

    return res.status(200).json({ 
      valid: true, 
      message: 'License verified successfully!' 
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}