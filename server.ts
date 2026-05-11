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
  const requiredEnvVars = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'GEMINI_API_KEY'
  ];

  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    console.error(`[Critical] Missing required environment variables: ${missingVars.join(', ')}`);
    console.error("Please configure these in the Settings -> Secrets menu.");
  }

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

  // --- DIAGNOSTIC ENDPOINT ---
  app.get("/api/admin/db-check", async (req, res) => {
    try {
      const { data: cols, error: colError } = await supabase
        .rpc('get_table_columns', { table_name_input: 'sessions' });
      
      if (colError) {
        // Fallback if RPC doesn't exist
        const { data: fallback, error: fallbackError } = await supabase
          .from('sessions')
          .select('*')
          .limit(1);
        
        return res.json({ 
          error: colError.message, 
          fallback_sample: fallback?.[0] ? Object.keys(fallback[0]) : 'No data',
          hint: "Try running: SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sessions';"
        });
      }
      res.json(cols);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- AUTH MIDDLEWARE ---
  const authMiddleware = async (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token || token === 'undefined' || token === 'null') {
      console.log(`[Auth] Rejected: No token provided for ${req.url}`);
      return res.status(401).json({ error: "Session expired or invalid" });
    }

    try {
      console.log(`[Auth] Verifying session: ${token.slice(0, 8)}...`);
      const { data: session, error } = await supabase
        .from('sessions')
        .select('*, employees(*)')
        .eq('id', token)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error) {
        console.error(`[Auth] Session lookup error:`, error.message);
        return res.status(401).json({ error: "Session expired or invalid" });
      }

      if (!session || !session.employees) {
        console.warn(`[Auth] Session not found or employee missing for token: ${token.slice(0, 8)}...`);
        return res.status(401).json({ error: "Session expired or invalid" });
      }

      console.log(`[Auth] Success: ${session.employees.full_name} (${session.employees.role})`);
      req.employee = session.employees;
      next();
    } catch (err: any) {
      console.error(`[Auth] Unexpected error:`, err.message);
      return res.status(401).json({ error: "Session expired or invalid" });
    }
  };

  const adminMiddleware = (req: any, res: any, next: any) => {
    if (req.employee.role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  };

  // --- AUTH ENDPOINTS ---

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { employeeId } = req.body;

      if (!employeeId) {
        return res.status(400).json({ success: false, error: 'Employee ID required' });
      }

      // Check employee exists and is active
      const { data: employee, error: empError } = await supabase
        .from('employees')
        .select('*')
        .eq('employee_id', employeeId.trim().toUpperCase())
        .eq('is_active', true)
        .single();

      if (empError || !employee) {
        return res.status(401).json({ success: false, error: 'Invalid Employee ID' });
      }

      // Generate token
      const { randomUUID } = await import('crypto');
      const token = randomUUID();

      // Insert session
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
      const { error: sessionError } = await supabase
        .from('sessions')
        .insert({
          id: token,
          employee_id: employee.employee_id,
          expires_at: expiresAt
        });

      if (sessionError) {
        console.error('Session insert error:', sessionError);
        return res.status(500).json({ success: false, error: 'Failed to create session' });
      }

      // Return token explicitly at top level
      const responseBody = {
        success: true,
        token: token,
        employee: {
          id: employee.employee_id,
          name: employee.full_name,
          role: employee.role
        }
      };

      console.log('Login successful. Response:', JSON.stringify(responseBody));
      return res.status(200).json(responseBody);

    } catch (err: any) {
      console.error('Login error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/auth/verify", authMiddleware, async (req: any, res) => {
    const employee = req.employee;
    res.json({
      success: true,
      employee: {
        id: employee.employee_id,
        name: employee.full_name,
        role: employee.role
      }
    });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      await supabase.from('sessions').delete().eq('id', token);
    }
    res.json({ success: true });
  });

  // --- EMPLOYEE MANAGEMENT ---
  app.get("/api/employees", authMiddleware, adminMiddleware, async (req, res) => {
    const { data, error } = await supabase.from('employees').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.patch("/api/employees/:id", authMiddleware, adminMiddleware, async (req, res) => {
    const { isActive } = req.body;
    const { data, error } = await supabase.from('employees').update({ is_active: isActive }).eq('employee_id', req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.delete("/api/employees/:id", authMiddleware, adminMiddleware, async (req, res) => {
    const { error } = await supabase.from('employees').delete().eq('employee_id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // --- CONVERSATION ROUTES ---
  app.get("/api/conversations", async (req, res) => {
    try {
      console.log('=== CONVERSATIONS GET ENDPOINT ===');
      console.log('Authorization header:', req.headers.authorization);

      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        console.log('No token provided');
        return res.status(200).json([]);
      }

      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('*, employees(*)')
        .eq('id', token)
        .gt('expires_at', new Date().toISOString())
        .single();

      console.log('Session:', JSON.stringify(session));
      if (sessionError) console.log('Session error:', JSON.stringify(sessionError));

      if (!session || !session.employees) {
        console.log('No valid session or employee found');
        return res.status(200).json([]);
      }

      let query = supabase.from('conversations').select('*').order('created_at', { ascending: false });
      
      if (session.employees.role !== 'admin') {
        query = query.eq('employee_id', session.employees.employee_id);
      }

      const { data: conversations, error } = await query;

      console.log('Conversations count:', conversations?.length || 0);
      if (error) console.log('Conversations error:', JSON.stringify(error));

      return res.status(200).json(conversations || []);

    } catch (err: any) {
      console.error('Conversations GET endpoint error:', err.message);
      return res.status(200).json([]);
    }
  });

  app.post("/api/conversations", async (req, res) => {
    try {
      console.log('=== CONVERSATIONS POST ENDPOINT ===');
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return res.status(200).json({ error: 'Auth required' }); // Or empty object if preferred, but following the "don't break load" spirit
      }

      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('*, employees(*)')
        .eq('id', token)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (sessionError || !session || !session.employees) {
        return res.status(200).json({ error: 'Session expired' });
      }

      const { title } = req.body;
      const { data, error } = await supabase.from('conversations').insert({ 
        title: title || 'New Conversation',
        employee_id: session.employees.employee_id 
      }).select().single();

      if (error) {
        console.error('Conversation creation error:', JSON.stringify(error));
        return res.status(200).json({ error: 'Creation failed' });
      }

      return res.json(data);
    } catch (err: any) {
      console.error('Conversations POST endpoint error:', err.message);
      return res.status(200).json({ error: err.message });
    }
  });

  app.get("/api/conversations/:id/messages", authMiddleware, async (req: any, res) => {
    const { data: conv } = await supabase.from('conversations').select('employee_id').eq('id', req.params.id).single();
    if (req.employee.role !== 'admin' && conv?.employee_id !== req.employee.employee_id) {
      return res.status(403).json({ error: "Access denied" });
    }
    const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', req.params.id).order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

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
  app.post("/api/process-document", authMiddleware, adminMiddleware, async (req, res) => {
    const { documentId, fileUrl, filename } = req.body;
    
    if (!documentId || !fileUrl) {
      return res.status(400).json({ error: "Missing documentId or fileUrl" });
    }

    try {
      console.log(`[Server] Starting process for ${filename} (ID: ${documentId})`);
      
      await supabase.from('documents').update({ status: 'processing', error_message: null }).eq('id', documentId);

      // 1. Download PDF
      console.log('Step 1: Downloading PDF from:', fileUrl);
      const pdfResponse = await fetch(fileUrl);
      if (!pdfResponse.ok) throw new Error(`Download failed: ${pdfResponse.statusText}`);
      const buffer = Buffer.from(await pdfResponse.arrayBuffer());
      console.log('Step 1 complete. Buffer size:', buffer.byteLength);

      // 2. Extract text
      console.log('Step 2: Extracting text using PDFParser...');
      const pages = await extractTextFromPDF(buffer);
      console.log('Step 2 complete. Pages found:', pages.length);
      
      let chunkIndex = 0;
      let totalChunks = 0;

      // 3. Chunk and Embed
      console.log('Step 3: Beginning chunking and embedding loop...');
      for (const page of pages) {
        const chunkSize = 1000;
        const overlap = 100;
        const text = page.text;
        
        console.log(`Processing page ${page.page_number} (length: ${text.length})`);

        for (let i = 0; i < text.length; i += chunkSize - overlap) {
          const chunkText = text.slice(i, i + chunkSize);
          if (chunkText.trim().length < 20) continue;

          console.log(`Generating embedding for chunk ${chunkIndex} (length: ${chunkText.length})`);
          const embedding = await getEmbedding(chunkText, GEMINI_API_KEY!);

          console.log(`Inserting chunk ${chunkIndex} into document_chunks...`);
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
      console.log('Step 3 complete. Total chunks processed and inserted:', totalChunks);

      // 4. Mark as ready
      console.log('Step 4: Finalizing document state to "ready"');
      await supabase.from('documents').update({ status: 'ready', chunk_count: totalChunks }).eq('id', documentId);
      
      console.log(`[Server] Successfully processed ${filename}`);
      res.json({ success: true, chunks: totalChunks });

    } catch (error: any) {
      console.error("PROCESSING FAILED AT STEP:", error);
      await supabase.from('documents').update({ status: 'error', error_message: error.message }).eq('id', documentId);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/documents/:id", authMiddleware, adminMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
      // 1. Delete chunks first (foreign key constraint)
      await supabase.from('document_chunks').delete().eq('document_id', id);
      // 2. Delete document
      const { error } = await supabase.from('documents').delete().eq('id', id);
      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 2. RAG Chat Logic
  app.post("/api/rag-chat", async (req, res) => {
    try {
      const { query, conversationId, documentId } = req.body;
      if (!query) return res.status(400).json({ error: "Missing query" });

      const token = req.headers.authorization?.replace('Bearer ', '');
      
      // Get employee if token exists but don't block if it doesn't
      let employeeId = null;

      if (token) {
        const { data: session } = await supabase
          .from('sessions')
          .select('*, employees(*)')
          .eq('id', token)
          .gt('expires_at', new Date().toISOString())
          .single();
        
        if (session) {
          employeeId = session.employees.employee_id;
        }
      }

      const queryEmbedding = await getEmbedding(query, GEMINI_API_KEY!);

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

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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
      const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';

      if (conversationId && employeeId) {
        await supabase.from('messages').insert([
          { conversation_id: conversationId, role: 'user', content: query, employee_id: employeeId },
          { conversation_id: conversationId, role: 'assistant', content: answer, employee_id: employeeId }
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
