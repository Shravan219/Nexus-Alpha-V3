import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const getEmbedding = async (text: string): Promise<number[]> => {
  const result = await ai.models.embedContent({
    model: "gemini-embedding-2-preview",
    contents: [{ parts: [{ text }] }]
  });
  
  if (!result.embeddings || result.embeddings.length === 0) {
    throw new Error("Failed to generate embedding");
  }
  
  return result.embeddings[0].values;
};

export const generateRAGResponse = async (query: string, context: string) => {
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

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{
      role: 'user',
      parts: [{ text: `DOCUMENT CONTEXT:\n${context}\n\nUSER QUERY: ${query}` }]
    }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.1,
      topP: 0.95,
      responseMimeType: "text/plain"
    }
  });

  return response.text;
};
