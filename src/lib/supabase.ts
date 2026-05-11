import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Check your .env file.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

export type Document = {
  id: string;
  name: string;
  content_type: string;
  size_bytes: number;
  status: 'pending' | 'processing' | 'ready' | 'error';
  chunk_count: number;
  error_message: string | null;
  created_at: string;
};

export type Conversation = {
  id: string;
  title: string;
  employee_id: string;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  employee_id: string;
  created_at: string;
};
