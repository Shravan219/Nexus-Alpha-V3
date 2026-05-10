import { createClient } from "@supabase/supabase-js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { query, conversationId, documentId } = req.body;

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
  );

  const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  try {
    // 1. Embed query
    const embedRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text: query }] }
        })
      }
    );
    const embedData = await embedRes.json();
    if (embedData.error) throw new Error(`Embedding Error: ${embedData.error.message}`);
    const queryEmbedding = embedData.embedding.values;

    // 2. Similarity search
    const { data: chunks, error: matchError } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_count: 8,
      filter_document_id: documentId || null
    });

    if (matchError) throw matchError;

    const context = chunks?.map((chunk: any) =>
      `[DOC: ${chunk.filename} · Page ${chunk.page_number}]\n${chunk.content}`
    ).join('\n\n') || '';

    const SYSTEM_PROMPT = `You are Nexus, an Institutional Memory Engine. Answer questions ONLY using the document context provided below. Never use your own training data under any circumstances.

STRICT RULES:
1. Every single claim must be followed by a citation: [DOC: filename · Page #]
2. If the answer is not in the context respond with: "This information is not present in the Knowledge Vault." followed by an Audit Note flagging what documentation is missing
3. Format as clean markdown.`;

    // 3. Call Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{
            role: 'user',
            parts: [{ text: `DOCUMENT CONTEXT:\n${context}\n\nQUESTION: ${query}` }]
          }]
        })
      }
    );

    const geminiData = await geminiRes.json();
    const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';

    // 4. Save history
    if (conversationId) {
      await supabase.from('messages').insert([
        { conversation_id: conversationId, role: 'user', content: query },
        { conversation_id: conversationId, role: 'assistant', content: answer }
      ]);
    }

    return res.status(200).json({ answer, chunks });

  } catch (error: any) {
    console.error("[Vercel RAG Error]", error);
    return res.status(500).json({ error: error.message });
  }
}
