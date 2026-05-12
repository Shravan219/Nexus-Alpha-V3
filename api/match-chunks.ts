import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession, getSupabase, getEmbedding, SYSTEM_PROMPT } from './_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const employee = await verifySession(req);
  if (!employee) return res.status(401).json({ error: 'Session expired' });

  const supabaseAdmin = getSupabase();

  try {
    const { query, documentId, conversationId } = req.body;
    console.log('Step 1: Query received:', query);

    const queryEmbedding = await getEmbedding(query);
    console.log('Step 2: Embedding generated. Dimensions:', queryEmbedding.length);

    const { data: chunks, error: rpcError } = await supabaseAdmin.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.1,
      match_count: 8,
      filter_document_id: documentId || null
    });

    console.log('Step 3: RPC complete. Chunks:', chunks?.length, 'Error:', rpcError);

    if (rpcError) throw new Error(`Search failed: ${rpcError.message}`);

    if (!chunks || chunks.length === 0) {
      console.log('Step 3 FAILED: No chunks returned despite threshold 0.1');
      
      // Try without threshold as fallback
      const { data: fallbackChunks, error: fallbackError } = await supabaseAdmin
        .from('document_chunks')
        .select('id, filename, page_number, chunk_index, content')
        .limit(4);
      
      console.log('Fallback chunks:', fallbackChunks?.length, 'Error:', fallbackError);
      
      if (!fallbackChunks || fallbackChunks.length === 0) {
        return res.status(200).json({
          answer: 'This information is not present in the Knowledge Vault. Audit Note: No documents found in the database.'
        });
      }

      // Use fallback chunks without similarity ranking
      const fallbackContext = fallbackChunks.map((chunk: any) =>
        `[DOC: ${chunk.filename} · Page ${chunk.page_number}]\n${chunk.content}`
      ).join('\n\n');

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;

      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{
            role: 'user',
            parts: [{ text: `DOCUMENT CONTEXT:\n${fallbackContext}\n\nQUESTION: ${query}` }]
          }]
        })
      });

      const fallbackData = await geminiRes.json();
      const fallbackAnswer = fallbackData.candidates?.[0]?.content?.parts?.[0]?.text || 'No answer generated';
      return res.status(200).json({ answer: fallbackAnswer });
    }

    console.log('Step 4: Building context...');
    const context = chunks.map((chunk: any) =>
      `[DOC: ${chunk.filename} · Page ${chunk.page_number}]\n${chunk.content}`
    ).join('\n\n');

    console.log('Step 5: Calling Gemini...');
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{
          role: 'user',
          parts: [{ text: `DOCUMENT CONTEXT:\n${context}\n\nQUESTION: ${query}` }]
        }],
        generationConfig: {
          temperature: 0.1,
          topP: 0.95
        }
      })
    });

    console.log('Step 5 complete. Gemini status:', geminiRes.status);

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      throw new Error(`Gemini Error (${geminiRes.status}): ${errorText}`);
    }

    const geminiData = await geminiRes.json();
    const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!answer) throw new Error(`No answer: ${JSON.stringify(geminiData)}`);

    console.log('Step 6: Answer generated. Length:', answer.length);

    if (conversationId) {
      await supabaseAdmin.from('messages').insert([
        { conversation_id: conversationId, role: 'user', content: query, employee_id: employee.employee_id },
        { conversation_id: conversationId, role: 'assistant', content: answer, employee_id: employee.employee_id }
      ]);
    }

    return res.status(200).json({ answer });

  } catch (err: any) {
    console.error('FATAL ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
}