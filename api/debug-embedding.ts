import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getEmbedding } from './_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const embedding = await getEmbedding('test query');
    return res.status(200).json({
      dimensions: embedding.length,
      first_values: embedding.slice(0, 3)
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}