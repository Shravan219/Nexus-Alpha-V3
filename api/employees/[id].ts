import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession, getSupabase } from '../_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const employee = await verifySession(req);
  if (!employee) return res.status(401).json({ error: 'Session expired' });

  if (employee.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const supabaseAdmin = getSupabase();
  const { id } = req.query; // This will be the employee_id text in this app's logic

  if (req.method === 'PATCH') {
    try {
      const { isActive, role } = req.body;
      const updates: any = {};
      if (isActive !== undefined) updates.is_active = isActive;
      if (role !== undefined) updates.role = role;

      const { data, error } = await supabaseAdmin
        .from('employees')
        .update(updates)
        .eq('employee_id', id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { error } = await supabaseAdmin
        .from('employees')
        .delete()
        .eq('employee_id', id);

      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
