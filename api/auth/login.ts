import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../_auth.js';
import crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS (Basic)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabaseAdmin = getSupabase();
    const { employeeId } = req.body;
    
    if (!employeeId) {
      return res.status(400).json({ success: false, error: 'Employee ID required' });
    }

    const { data: employee, error: fetchError } = await supabaseAdmin
      .from('employees')
      .select('*')
      .eq('employee_id', employeeId.trim().toUpperCase())
      .eq('is_active', true)
      .single();

    if (fetchError || !employee) {
      console.error('Login Fetch Error:', fetchError);
      return res.status(401).json({ success: false, error: 'Invalid or inactive Employee ID' });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

    const { error: sessionError } = await supabaseAdmin
      .from('sessions')
      .insert({ id: token, employee_id: employee.employee_id, expires_at: expiresAt });

    if (sessionError) {
      console.error('Session Creation Error:', sessionError);
      throw new Error('Failed to create secure session');
    }

    return res.status(200).json({
      success: true,
      token,
      employee: {
        id: employee.employee_id,
        name: employee.full_name,
        role: employee.role
      }
    });
  } catch (err: any) {
    console.error('Vercel Login Function Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
