import { createClient } from "@supabase/supabase-js";
import PDFParser from 'pdf2json';

const extractTextFromPDF = (buffer: Buffer): Promise<{page_number: number, text: string}[]> => {
  return new Promise((resolve, reject) => {
    // @ts-ignore
    const pdfParser = new PDFParser(null, 1);
    
    pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
      const pages = pdfData.Pages.map((page: any, index: number) => ({
        page_number: index + 1,
        text: page.Texts.map((t: any) => 
          decodeURIComponent(t.R.map((r: any) => r.T).join(' '))
        ).join(' ')
      })).filter((p: any) => p.text.trim().length > 0);
      resolve(pages);
    });
    
    pdfParser.on('pdfParser_dataError', reject);
    pdfParser.parseBuffer(buffer);
  });
};

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
    const pages = await extractTextFromPDF(buffer);
    
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

        const embedding = await getEmbedding(chunkText, GEMINI_API_KEY!);

        const { error: insertError } = await supabase.from('document_chunks').insert({
          document_id: documentId,
          filename,
          page_number: page.page_number,
          chunk_index: chunkIndex++,
          content: chunkText,
          embedding
        });

        if (insertError) {
          console.error(`Chunk insert failed at index ${chunkIndex-1}:`, JSON.stringify(insertError));
          throw new Error(`Failed to insert chunk: ${insertError.message}`);
        }

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
