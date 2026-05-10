import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import pdfParse from "npm:pdf-parse";

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

    // Download PDF
    const pdfResponse = await fetch(fileUrl);
    const buffer = await pdfResponse.arrayBuffer();

    // Extract text with pdf-parse
    const data = await pdfParse(Buffer.from(buffer));
    const pages = data.text.split('\f')
      .map((text: string, i: number) => ({
        page_number: i + 1,
        text: text.trim()
      }))
      .filter((p: any) => p.text.length > 0);

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
          `https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'models/text-embedding-004',
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
