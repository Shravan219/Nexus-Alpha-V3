import { version } from 'react';

// Exporting React 19 version check for logging
console.log(`Nexus Alpha initialized with React ${version}`);

export const RAG_CONFIG = {
  CHUNK_SIZE: 500,
  CHUNK_OVERLAP: 50,
  EMBEDDING_MODEL: 'gemini-embedding-001',
  GENERATION_MODEL: 'gemini-2.5-flash'
};
