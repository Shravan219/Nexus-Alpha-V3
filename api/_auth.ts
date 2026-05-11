import { createClient } from '@supabase/supabase-js';
import type { VercelRequest } from '@vercel/node';

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const verifySession = async (req: VercelRequest) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token === 'undefined' || token === 'null') return null;

  const { data: session } = await supabaseAdmin
    .from('sessions')
    .select('*, employees(*)')
    .eq('id', token)
    .single();

  if (!session) return null;

  const now = new Date();
  const expiresAt = new Date(session.expires_at);
  if (now > expiresAt) return null;

  return session.employees;
};

export const getEmbedding = async (text: string): Promise<number[]> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not defined in the environment");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] }
    })
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Embedding API Error (${res.status}): ${errorBody}`);
  }

  const data = await res.json();
  if (!data?.embedding?.values) {
    throw new Error(`Invalid embedding response: ${JSON.stringify(data)}`);
  }
  return data.embedding.values;
};

export const SYSTEM_PROMPT = `You are Nexus, an Institutional Memory Engine. Answer ONLY from the document context provided. Never use your own training data.

RULES:
1. Every claim must be followed immediately by [DOC: filename · Page #]
2. If answer not in context say: "This information is not present in the Knowledge Vault." then add Audit Note explaining what is missing
3. Every bullet point needs its own citation
4. Label Grounded Facts vs Architectural Recommendations
5. Format in clean markdown with bold headers and bullet points
6. Be direct and precise — no filler phrases or pleasantries`;
