import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import PDFParser from 'pdf2json';
import dotenv from "dotenv";

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

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // Debug middleware
  app.use((req, res, next) => {
    console.log(`[Server] ${req.method} ${req.url}`);
    next();
  });

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!
  );

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("[Warning] SUPABASE_SERVICE_ROLE_KEY missing. Using ANON key. Server-side writes may fail due to RLS.");
  } else {
    console.log("[Info] Using SUPABASE_SERVICE_ROLE_KEY for server-side processing.");
  }

  const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  // --- API ROUTES ---

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Nexus Engine is online" });
  });

  app.get("/api/list-models", async (req, res) => {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`
      );
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 1. Process Document Logic
  app.post("/api/process-document", async (req, res) => {
    const { documentId, fileUrl, filename } = req.body;
    
    if (!documentId || !fileUrl) {
      return res.status(400).json({ error: "Missing documentId or fileUrl" });
    }

    try {
      console.log(`[Server] Processing: ${filename}`);
      
      await supabase.from('documents').update({ status: 'processing', error_message: null }).eq('id', documentId);

      const pdfResponse = await fetch(fileUrl);
      if (!pdfResponse.ok) throw new Error(`Download failed: ${pdfResponse.statusText}`);
      const buffer = Buffer.from(await pdfResponse.arrayBuffer());

      const pages = await extractTextFromPDF(buffer);
      
      let chunkIndex = 0;
      let totalChunks = 0;

      for (const page of pages) {
        const chunkSize = 1000;
        const overlap = 100;
        const text = page.text;

        for (let i = 0; i < text.length; i += chunkSize - overlap) {
          const chunkText = text.slice(i, i + chunkSize);
          if (chunkText.trim().length < 20) continue;

          const embedding = await getEmbedding(chunkText, GEMINI_API_KEY!);

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
    const { query, conversationId, documentId } = req.body;
    
    if (!query) return res.status(400).json({ error: "Missing query" });

    try {
      const queryEmbedding = await getEmbedding(query, GEMINI_API_KEY!);

      const { data: chunks, error: matchError } = await supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.5,
        match_count: 8,
        filter_document_id: documentId || null
      });

      if (matchError) throw matchError;

      const context = chunks?.map((chunk: any) =>
        `[DOC: ${chunk.filename} · Page ${chunk.page_number}]\n${chunk.content}`
      ).join('\n\n') || '';

      const SYSTEM_PROMPT = `You are Nexus, an Institutional Memory Engine. Answer questions ONLY using context provided.
STRICT RULES:
1. Citations: [DOC: filename · Page #]
2. If unknown: "This information is not present in the Knowledge Vault."
3. Format as clean markdown.`;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{
              role: 'user',
              parts: [{ text: `CONTEXT:\n${context}\n\nQUESTION: ${query}` }]
            }]
          })
        }
      );

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        throw new Error(`Gemini Generation Error (${geminiRes.status}): ${errText}`);
      }

      const geminiData = await geminiRes.json();
      const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated (Response structure: ' + JSON.stringify(geminiData) + ')';

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

  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
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
