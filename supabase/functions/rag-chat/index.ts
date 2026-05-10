import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SYSTEM_PROMPT = `You are Nexus, an Institutional Memory Engine. Answer questions ONLY using the document context provided below. Never use your own training data under any circumstances.

STRICT RULES:
1. Every single claim must be immediately followed by a citation: [DOC: filename · Page #]
2. If the answer is not in the context respond with: "This information is not present in the Knowledge Vault." followed by an Audit Note flagging what documentation is missing
3. For SOPs every bullet point needs its own citation
4. Label Grounded Facts (from documents) vs Architectural Recommendations (best practice when docs incomplete)
5. Format responses in markdown with clear headers and bullet points`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const { query, conversationId, geminiApiKey, documentId } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Embed query
    const embedRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text: query }] }
        })
      }
    );
    const embedData = await embedRes.json();
    
    if (embedData.error) {
      throw new Error(`Gemini Embedding Error: ${embedData.error.message}`);
    }
    
    const queryEmbedding = embedData.embedding.values;

    // Similarity search
    const { data: chunks } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_count: 8,
      filter_document_id: documentId || null
    });

    // Assemble context
    const context = chunks?.map((chunk: any) =>
      `[DOC: ${chunk.filename} · Page ${chunk.page_number}]\n${chunk.content}`
    ).join('\n\n') || '';

    // Call Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
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
    
    if (geminiData.error) {
      throw new Error(`Gemini Generation Error: ${geminiData.error.message}`);
    }
    
    const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';

    // Save messages
    if (conversationId) {
      await supabase.from('messages').insert([
        { conversation_id: conversationId, role: 'user', content: query },
        { conversation_id: conversationId, role: 'assistant', content: answer }
      ]);
    }

    return new Response(JSON.stringify({ answer, chunks }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
});
