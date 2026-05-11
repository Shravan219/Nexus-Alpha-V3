import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../_auth';
import { randomUUID } from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { employeeId } = req.body;
    if (!employeeId) return res.status(400).json({ success: false, error: 'Employee ID required' });

    const { data: employee } = await supabaseAdmin
      .from('employees')
      .select('*')
      .eq('employee_id', employeeId.trim().toUpperCase())
      .eq('is_active', true)
      .single();

    if (!employee) return res.status(401).json({ success: false, error: 'Invalid Employee ID' });

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

    const { error: sessionError } = await supabaseAdmin
      .from('sessions')
      .insert({ id: token, employee_id: employee.employee_id, expires_at: expiresAt });

    if (sessionError) throw new Error('Failed to create session');

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
    return res.status(500).json({ success: false, error: err.message });
  }
}
