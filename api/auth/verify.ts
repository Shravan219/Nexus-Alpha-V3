import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession } from '../_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const employee = await verifySession(req);
  if (!employee) return res.status(401).json({ error: 'Invalid session' });
  return res.status(200).json({
    employee: {
      id: employee.employee_id,
      name: employee.full_name,
      role: employee.role
    }
  });
}
