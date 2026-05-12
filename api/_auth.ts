import { createClient } from '@supabase/supabase-js';
import type { VercelRequest } from '@vercel/node';

let _supabaseAdmin: any = null;

const getSupabaseAdmin = () => {
  if (!_supabaseAdmin) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Critical: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required environment variables. Please set them in your Vercel project settings.");
    }
    _supabaseAdmin = createClient(url, key);
  }
  return _supabaseAdmin;
};

// Export as a function to ensure it's only called within a request handler
export const getSupabase = () => getSupabaseAdmin();

export const verifySession = async (req: VercelRequest) => {
  const supabase = getSupabaseAdmin();
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token === 'undefined' || token === 'null') return null;

  const { data: session } = await supabase
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
      model: 'models/gemini-embedding-001',
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

export const SYSTEM_PROMPT = `You are Nexus, an Institutional Memory Engine. Answer questions using the document context provided. Apply intelligent reasoning to find relevant information even when the exact phrasing differs.

RULES:
1. Every claim must be followed immediately by [DOC: filename · Page #]
2. Use intelligent inference — if a document contains a table of tools, that IS a list of approved tools even if not explicitly labeled as such
3. If information exists in the context but under different terminology, use it and explain the connection
4. Only say "not present in Knowledge Vault" if the information genuinely does not exist anywhere in the provided context
5. Every bullet point needs its own citation
6. Label Grounded Facts vs Architectural Recommendations
7. Format in clean markdown with bold headers and bullet points
8. Be direct and precise — no filler phrases

IMPORTANT: Look carefully at tables, lists, and structured data in the context. A table of tools IS information about tools. A list of steps IS a process. Extract meaning intelligently, don't just match exact phrases.`;