import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession, getSupabase } from './_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = req.method?.toUpperCase();
  console.log(`[API] Employees request: ${method}`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') return res.status(200).end();

  const employee = await verifySession(req);
  if (!employee) return res.status(401).json({ error: 'Session expired' });

  // Only admins can manage employees
  if (employee.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized: Admin access required' });
  }

  const supabaseAdmin = getSupabase();

  if (method === 'GET') {
    try {
      const { data, error } = await supabaseAdmin
        .from('employees')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json(data || []);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { employeeId, fullName, role } = req.body;
      const { data, error } = await supabaseAdmin
        .from('employees')
        .insert({
          employee_id: employeeId.trim().toUpperCase(),
          full_name: fullName,
          role: role || 'employee',
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
