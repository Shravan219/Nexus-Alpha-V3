import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession, getSupabase } from '../_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = req.method?.toUpperCase();
  const id = req.query.id as string;
  console.log(`[API] Employees Index request: ${method}${id ? ` ID: ${id}` : ''}`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') return res.status(200).end();

  try {
    const operator = await verifySession(req);
    if (!operator) return res.status(401).json({ error: 'Session expired' });

    // Only admins can manage employees
    if (operator.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Admin access required' });
    }

    const supabaseAdmin = getSupabase();

    if (method === 'GET') {
      if (id) {
        const { data, error } = await supabaseAdmin
          .from('employees')
          .select('*')
          .eq('employee_id', id)
          .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Employee not found' });
        return res.status(200).json(data);
      }

      const { data, error } = await supabaseAdmin
        .from('employees')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (method === 'POST') {
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
    }

    if (method === 'PUT' || method === 'PATCH') {
      if (!id) return res.status(400).json({ error: 'Employee ID required' });
      
      const updates = req.body;
      const { data, error } = await supabaseAdmin
        .from('employees')
        .update(updates)
        .eq('employee_id', id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    if (method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Employee ID required' });
      
      if (operator.employee_id === id) {
        return res.status(400).json({ error: 'Cannot delete your own active profile' });
      }

      const { error } = await supabaseAdmin
        .from('employees')
        .delete()
        .eq('employee_id', id);

      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: `Method ${method} not allowed on employees index` });
  } catch (err: any) {
    console.error('[API Error] Employees Index:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
