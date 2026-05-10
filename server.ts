import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import pdfParse from "pdf-parse";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
  );

  const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  // --- API ROUTES ---

  // 1. Process Document Logic
  app.post("/api/process-document", async (req, res) => {
    const { documentId, fileUrl, filename } = req.json || req.body;
    
    try {
      console.log(`[Server] Processing document: ${filename}`);
      
      // Update status to processing
      await supabase.from('documents').update({ status: 'processing' }).eq('id', documentId);

      // Download PDF
      const pdfResponse = await fetch(fileUrl);
      const buffer = Buffer.from(await pdfResponse.arrayBuffer());

      // Extract text
      const data = await pdfParse(buffer);
      const pages = data.text.split('\f')
        .map((text, i) => ({ page_number: i + 1, text: text.trim() }))
        .filter(p => p.text.length > 0);

      let chunkIndex = 0;
      let totalChunks = 0;

      for (const page of pages) {
        const chunkSize = 500;
        const overlap = 50;
        const text = page.text;

        for (let i = 0; i < text.length; i += chunkSize - overlap) {
          const chunkText = text.slice(i, i + chunkSize);
          if (chunkText.trim().length < 20) continue;

          // Get embedding via REST
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
          if (embedData.error) throw new Error(embedData.error.message);
          
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

      await supabase.from('documents').update({ status: 'ready', chunk_count: totalChunks }).eq('id', documentId);
      res.json({ success: true, chunks: totalChunks });

    } catch (error: any) {
      console.error("[Server Error]", error);
      await supabase.from('documents').update({ status: 'error', error_message: error.message }).eq('id', documentId);
      res.status(500).json({ error: error.message });
    }
  });

  // 2. RAG Chat Logic
  app.post("/api/rag-chat", async (req, res) => {
    const { query, conversationId, documentId } = req.json || req.body;
    
    try {
      // Embed query
      const embedRes = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
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
      if (embedData.error) throw new Error(embedData.error.message);
      const queryEmbedding = embedData.embedding.values;

      // Similarity search
      const { data: chunks } = await supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_count: 8,
        filter_document_id: documentId || null
      });

      const context = chunks?.map((chunk: any) =>
        `[DOC: ${chunk.filename} · Page ${chunk.page_number}]\n${chunk.content}`
      ).join('\n\n') || '';

      const SYSTEM_PROMPT = `You are Nexus, an Institutional Memory Engine. Answer questions ONLY using the document context provided below. Never use your own training data under any circumstances.

STRICT RULES:
1. Every single claim must be immediately followed by a citation: [DOC: filename · Page #]
2. If the answer is not in the context respond with: "This information is not present in the Knowledge Vault." followed by an Audit Note flagging what documentation is missing
3. For SOPs every bullet point needs its own citation
4. Label Grounded Facts (from documents) vs Architectural Recommendations (best practice when docs incomplete)
5. Format responses in markdown with clear headers and bullet points`;

      // Call Gemini
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

      if (conversationId) {
        await supabase.from('messages').insert([
          { conversation_id: conversationId, role: 'user', content: query },
          { conversation_id: conversationId, role: 'assistant', content: answer }
        ]);
      }

      res.json({ answer, chunks });
    } catch (error: any) {
      console.error("[Server Error]", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Nexus Engine Server Running on http://localhost:${PORT}`);
  });
}

startServer();
