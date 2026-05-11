import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession, getSupabase } from './_auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const employee = await verifySession(req);
  if (!employee) return res.status(401).json({ error: 'Session expired' });

  const supabaseAdmin = getSupabase();
  if (req.method === 'GET') {
    const { data } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('employee_id', employee.employee_id)
      .order('created_at', { ascending: false });
    return res.status(200).json(data || []);
  }

  if (req.method === 'POST') {
    const { title } = req.body;
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert({
        title: title || 'New Conversation',
        employee_id: employee.employee_id
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
