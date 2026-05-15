// api/employees/_id.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession, getSupabase } from '../_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const method = req.method?.toUpperCase();
  console.log(`[API] Employees/Id request: ${method} ${req.url}`);

  // Secure CORS Configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle Preflight Request
  if (method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. Session & Access Control Verification
    const operator = await verifySession(req);
    if (!operator) {
      console.warn(`[API] Unauthorized: Token ${req.headers.authorization?.substring(0, 10)}...`);
      return res.status(401).json({ error: 'Session expired or unauthorized' });
    }

    const supabaseAdmin = getSupabase();
    const id = req.query.id as string; // Extracted dynamically from vercel.json route parameter

    if (!id) {
      return res.status(400).json({ error: 'Employee ID parameter required' });
    }

    // 2. Action Routing Based on HTTP Method

    // --- HANDLE GET (Read Single Employee Profile) ---
    if (method === 'GET') {
      const { data: employee, error: fetchError } = await supabaseAdmin
        .from('employees')
        .select('id, name, email, role, department, created_at')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      if (!employee) return res.status(404).json({ error: 'Employee asset not found' });

      return res.status(200).json(employee);
    }

    // --- HANDLE PUT / PATCH (Update Employee Details - Admin Only) ---
    if (method === 'PUT' || method === 'PATCH') {
      if (operator.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized: Admin access required to update staff credentials' });
      }

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

    // --- HANDLE DELETE (Terminate / Offboard Employee - Admin Only) ---
    if (method === 'DELETE') {
      if (operator.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized: Admin access required for personnel termination' });
      }

      // Prevent accidental self-deletion
      if (operator.id === id) {
        return res.status(400).json({ error: 'Security Conflict: You cannot delete your own operational profile' });
      }

      const { error: deleteError } = await supabaseAdmin
        .from('employees')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      return res.status(200).json({ success: true, message: 'Employee successfully purged from roster' });
    }

    // 3. Fallback for Unsupported Operations
    return res.status(405).json({ error: `Method ${method} not allowed on employee detail endpoint` });
  } catch (err: any) {
    console.error('[API Error] Employees/Id:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}