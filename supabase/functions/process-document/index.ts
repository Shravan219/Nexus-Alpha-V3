import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// System prompt for Gemini-based extraction to keep function small
const EXTRACTION_PROMPT = "Extract all text from this document page by page. Return a JSON array where each object has 'page_number' and 'text'. Format: [{\"page_number\": 1, \"text\": \"...\"}, ...]";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const { documentId, fileUrl, filename, geminiApiKey } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Update status to processing
    await supabase.from('documents')
      .update({ status: 'processing' })
      .eq('id', documentId);

    // Download File (Small files only for this demo, large files should use Gemini File API)
    const fileResponse = await fetch(fileUrl);
    const blob = await fileResponse.blob();
    const base64Buffer = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(blob);
    });

    // Use Gemini 2.5 Flash to "see" the PDF and extract text
    // This moves the heavy parsing to Google's infra, keeping the Edge Function tiny
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: EXTRACTION_PROMPT }] },
          contents: [{
            parts: [
              { inline_data: { mime_type: "application/pdf", data: base64Buffer } }
            ]
          }],
          generationConfig: { response_mime_type: "application/json" }
        })
      }
    );

    const geminiData = await geminiRes.json();
    if (geminiData.error) throw new Error(`Gemini Extraction failed: ${geminiData.error.message}`);
    
    const extractionResult = JSON.parse(geminiData.candidates[0].content.parts[0].text);
    const pages = Array.isArray(extractionResult) ? extractionResult : [];

    // Check for existing chunks (idempotency)
    const { count } = await supabase
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', documentId);

    if (count && count > 0) {
      await supabase.from('documents')
        .update({ status: 'ready', chunk_count: count })
        .eq('id', documentId);
      return new Response(JSON.stringify({ message: 'Already processed' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Chunk and embed
    let chunkIndex = 0;
    let totalChunks = 0;

    for (const page of pages) {
      const chunkSize = 500;
      const overlap = 50;
      const text = page.text;

      for (let i = 0; i < text.length; i += chunkSize - overlap) {
        const chunkText = text.slice(i, i + chunkSize);
        if (chunkText.trim().length < 20) continue;

        // Get embedding
        const embedRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'models/gemini-embedding-001',
              content: { parts: [{ text: chunkText }] }
            })
          }
        );
        const embedData = await embedRes.json();
        
        if (embedData.error) {
          throw new Error(`Gemini Embedding Error: ${embedData.error.message}`);
        }
        
        const embedding = embedData.embedding.values;

        // Insert chunk
        await supabase.from('document_chunks').insert({
          document_id: documentId,
          filename,
          page_number: page.page_number,
          chunk_index: chunkIndex++,
          content: chunkText,
          embedding
        });

        totalChunks++;
      }
    }

    // Update document as ready
    await supabase.from('documents')
      .update({ status: 'ready', chunk_count: totalChunks })
      .eq('id', documentId);

    return new Response(JSON.stringify({ success: true, chunks: totalChunks }), {
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
