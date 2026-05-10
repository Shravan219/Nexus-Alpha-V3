import { createClient } from "@supabase/supabase-js";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { documentId, fileUrl, filename } = req.body;

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
  );

  const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  try {
    // 1. Update status to processing
    await supabase.from('documents').update({ status: 'processing', error_message: null }).eq('id', documentId);

    // 2. Download PDF
    const pdfResponse = await fetch(fileUrl);
    if (!pdfResponse.ok) throw new Error(`Failed to download file: ${pdfResponse.statusText}`);
    const buffer = Buffer.from(await pdfResponse.arrayBuffer());

    // 3. Extract text
    const data = await pdfParse(buffer);
    const pages = data.text.split('\f')
      .map((text: string, i: number) => ({ page_number: i + 1, text: text.trim() }))
      .filter((p: any) => p.text.length > 0);

    let chunkIndex = 0;
    let totalChunks = 0;

    // 4. Chunk and Embed
    for (const page of pages) {
      const chunkSize = 1000;
      const overlap = 100;
      const text = page.text;

      for (let i = 0; i < text.length; i += chunkSize - overlap) {
        const chunkText = text.slice(i, i + chunkSize);
        if (chunkText.trim().length < 20) continue;

        const embedRes = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
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
        if (embedData.error) throw new Error(`Gemini Embedding Error: ${embedData.error.message}`);
        
        const embedding = embedData.embedding.values;

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

    // 5. Mark as ready
    await supabase.from('documents').update({ status: 'ready', chunk_count: totalChunks }).eq('id', documentId);
    
    return res.status(200).json({ success: true, chunks: totalChunks });

  } catch (error: any) {
    console.error("[Vercel API Error]", error);
    await supabase.from('documents').update({ status: 'error', error_message: error.message }).eq('id', documentId);
    return res.status(500).json({ error: error.message });
  }
}
