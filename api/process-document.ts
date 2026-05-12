import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession, getSupabase, getEmbedding } from './_auth.js';
import PDFParser from 'pdf2json';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const extractTextFromPDF = (buffer: Buffer): Promise<{page_number: number, text: string}[]> => {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, true);
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const employee = await verifySession(req);
  if (!employee || employee.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const supabaseAdmin = getSupabase();
  const { documentId, fileUrl, filename } = req.body;

  try {
    await supabaseAdmin.from('documents').update({ status: 'processing' }).eq('id', documentId);

    const pdfRes = await fetch(fileUrl);
    const buffer = Buffer.from(await pdfRes.arrayBuffer());
    const pages = await extractTextFromPDF(buffer);

    const { count } = await supabaseAdmin
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', documentId);

    if (count && count > 0) {
      return res.status(200).json({ message: 'Already processed' });
    }

    let totalChunks = 0;
    let chunkIndex = 0;

    for (const page of pages) {
      const chunkSize = 500;
      const overlap = 50;
      const text = page.text;

      for (let i = 0; i < text.length; i += chunkSize - overlap) {
        const chunkText = text.slice(i, i + chunkSize);
        if (chunkText.trim().length < 20) continue;

        const embedding = await getEmbedding(chunkText);
        await sleep(300);

        const { error } = await supabaseAdmin.from('document_chunks').insert({
          document_id: documentId,
          filename,
          page_number: page.page_number,
          chunk_index: chunkIndex++,
          content: chunkText,
          embedding
        });

        if (error) throw new Error(`Insert failed: ${error.message}`);
        totalChunks++;
      }
    }

    await supabaseAdmin.from('documents')
      .update({ status: 'ready', chunk_count: totalChunks })
      .eq('id', documentId);

    return res.status(200).json({ success: true, chunks: totalChunks });

  } catch (err: any) {
    await supabaseAdmin.from('documents')
      .update({ status: 'error', error_message: err.message })
      .eq('id', documentId);
    return res.status(500).json({ error: err.message });
  }
}
