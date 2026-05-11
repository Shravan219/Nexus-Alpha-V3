import { createClient } from "@supabase/supabase-js";

const getEmbedding = async (text: string, apiKey: string): Promise<number[]> => {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text }] }
      })
    }
  );
  const data = await res.json();
  if (!data?.embedding?.values) {
    throw new Error(`Embedding failed: ${JSON.stringify(data)}`);
  }
  return data.embedding.values;
};

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
    const queryEmbedding = await getEmbedding(query, GEMINI_API_KEY!);

    // 2. Similarity search
    const { data: chunks, error: matchError } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: 8,
      filter_document_id: documentId || null
    });

    if (matchError) throw matchError;

    const context = chunks?.map((chunk: any) =>
      `[DOC: ${chunk.filename} | Page ${chunk.page_number}]\n${chunk.content}`
    ).join('\n\n') || '';

    const SYSTEM_PROMPT = `You are Nexus, the Institutional Memory Engine. Answer queries with absolute precision using ONLY the provided document context.

TONE & VOICE:
- Assume the persona of a Senior Technical Architect.
- Be direct, clinical, and precise. 
- Eliminate all conversational filler (no "Certainly!", "I can help with that", or "Great question").
- Use declarative sentences. Never use "I" or address the user directly.

STRUCTURE:
- Lead with the most critical information.
- Use bold Markdown headers (### Header) for major sections.
- Use bullet points for lists and numbered lists for sequential protocols.
- Paragraphs must be concise (max 3 sentences).
- Mandatory double spacing between sections.

CITATION PROTOCOL:
- Every claim must be followed by a citation in this EXACT format: [DOC: filename | Page #].
- Place the citation immediately after the supporting claim, not at the end of the paragraph or section.
- Every bullet point must include its own citation on the same line if supported.
- Never stack citations.

FORMATTING:
- Use asterisks only for **bold** and *italic* emphasis.
- Use ALL CAPS only for SECTION LABELS or high-level status indicators.
- No ellipses, em dashes, or decorative syntax.
- Zero closing statements or pleasantries.

MISSING INFORMATION (DATA DEFICIENCY PROTOCOL):
- If the vault contains insufficient data, state exactly: "This information is not present in the Knowledge Vault."
- Follow immediately with a clinical 'Nexus Audit' note identifying the specific missing documentation.
- Never apologize for data gaps.

STRICT NEGATIVE CONSTRAINT:
- DO NOT RETURN JSON. Respond ONLY with raw Markdown text.`;

    // 3. Call Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{
            role: 'user',
            parts: [{ text: `DOCUMENT CONTEXT:\n${context}\n\nUSER QUERY: ${query}` }]
          }],
          generationConfig: {
            temperature: 0.1,
            topP: 0.95,
            responseMimeType: "text/plain"
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini Generation Error (${geminiRes.status}): ${errText}`);
    }

    const geminiData = await geminiRes.json();
    const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated (Response structure: ' + JSON.stringify(geminiData) + ')';

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
