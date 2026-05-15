// api/employees/_id.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession, getSupabase } from '../_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = req.method?.toUpperCase();
  console.log(`[API] Employees/Id request: ${method} ${req.url}`);

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') return res.status(200).end();

  try {
    const operator = await verifySession(req);
    if (!operator) {
      return res.status(401).json({ error: 'Session expired or unauthorized' });
    }

    const supabaseAdmin = getSupabase();
    const id = req.query.id as string;

    if (!id) return res.status(400).json({ error: 'Employee ID required' });

    // --- EXECUTE GET ---
    if (method === 'GET') {
      const { data: employee, error: fetchError } = await supabaseAdmin
        .from('employees')
        .select('id, name, email, role, department, created_at')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      return res.status(200).json(employee);
    }

    // --- EXECUTE UPDATE ---
    if (method === 'PUT' || method === 'PATCH') {
      const updates = req.body;
      const { data: updatedEmployee, error: updateError } = await supabaseAdmin
        .from('employees')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;
      return res.status(200).json({ success: true, data: updatedEmployee });
    }

    // --- EXECUTE DELETE ---
    if (method === 'DELETE') {
      if (operator.id === id) {
        return res.status(400).json({ error: 'Cannot delete your own active profile' });
      }

      const { error: deleteError } = await supabaseAdmin
        .from('employees')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: `Method ${method} not allowed` });
  } catch (err: any) {
    console.error('[API Error] Employees/Id:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}