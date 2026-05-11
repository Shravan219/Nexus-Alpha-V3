import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession, supabaseAdmin, getEmbedding, SYSTEM_PROMPT } from './_auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const employee = await verifySession(req);
  if (!employee) return res.status(401).json({ error: 'Session expired' });

  try {
    const { query, documentId, conversationId } = req.body;

    const queryEmbedding = await getEmbedding(query);

    const { data: chunks, error: rpcError } = await supabaseAdmin.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_count: 4,
      filter_document_id: documentId || null
    });

    if (rpcError) throw new Error(`Search failed: ${rpcError.message}`);

    if (!chunks || chunks.length === 0) {
      return res.status(200).json({
        answer: 'This information is not present in the Knowledge Vault. Audit Note: No relevant chunks found. Ensure documents have been properly ingested.'
      });
    }

    const context = chunks.map((chunk: any) =>
      `[DOC: ${chunk.filename} · Page ${chunk.page_number}]\n${chunk.content.slice(0, 300)}`
    ).join('\n\n');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{
            role: 'user',
            parts: [{ text: `DOCUMENT CONTEXT:\n${context}\n\nQUESTION: ${query}` }]
          }]
        })
      }
    );

    clearTimeout(timeout);

    const geminiData = await geminiRes.json();
    const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!answer) throw new Error(`No answer: ${JSON.stringify(geminiData)}`);

    if (conversationId) {
      await supabaseAdmin.from('messages').insert([
        { conversation_id: conversationId, role: 'user', content: query, employee_id: employee.employee_id },
        { conversation_id: conversationId, role: 'assistant', content: answer, employee_id: employee.employee_id }
      ]);
    }

    return res.status(200).json({ answer });

  } catch (err: any) {
    if (err.name === 'AbortError') {
      return res.status(200).json({ answer: 'Response timed out. Please ask a more specific question.' });
    }
    return res.status(500).json({ error: err.message });
  }
}
