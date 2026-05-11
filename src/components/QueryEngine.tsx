import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Message } from '@/lib/supabase';
import { Send, Cpu, User, Loader2, Database, Info, RefreshCw, Command, Zap } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface QueryEngineProps {
  selectedDocId: string | null;
  conversationId: string | null;
  onConversationChange: (id: string) => void;
}

export default function QueryEngine({ selectedDocId, conversationId, onConversationChange }: QueryEngineProps) {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadStep, setLoadStep] = useState(0); // 0: idle, 1: nexus appears, 2: neural stream, 3: extracting
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (conversationId) {
      fetchMessages(conversationId);
    } else {
      setMessages([]);
    }
  }, [conversationId]);

  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-slot="scroll-area-viewport"]');
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [messages, loadStep]);

  const fetchMessages = async (id: string) => {
    const { data } = await supabase.from('messages').select('*').eq('conversation_id', id).order('created_at', { ascending: true });
    if (data) setMessages(data);
  };

  const createConversation = async () => {
    const { data } = await supabase.from('conversations').insert({ title: query.slice(0, 30) || 'New Inquiry' }).select().single();
    if (data) {
      onConversationChange(data.id);
      return data.id;
    }
    return null;
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim() || isLoading) return;

    let currentConversationId = conversationId;
    if (!currentConversationId) {
      currentConversationId = await createConversation();
    }

    if (!currentConversationId) return;

    const userQuery = query;
    setQuery('');
    
    // Add optimistic user message
    const tempUserMsg: Message = {
      id: Math.random().toString(),
      conversation_id: currentConversationId,
      role: 'user',
      content: userQuery,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    setIsLoading(true);
    setLoadStep(1);
    
    // Animate through sequence
    setTimeout(() => setLoadStep(2), 800);
    setTimeout(() => setLoadStep(3), 1600);

    try {
      const response = await fetch('/api/rag-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: userQuery,
          conversationId: currentConversationId,
          documentId: selectedDocId
        })
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const result = await response.json();
          throw new Error(result.error || `Server error: ${response.status}`);
        } else {
          const text = await response.text();
          console.error("Server returned non-JSON:", text);
          throw new Error(`Server returned HTML/Text (Error ${response.status}). Check console.`);
        }
      }

      const result = await response.json();

      await fetchMessages(currentConversationId);
    } catch (error: any) {
      toast.error(`Neural Link Failure: ${error.message}`);
    } finally {
      setIsLoading(false);
      setLoadStep(0);
    }
  };

  const renderMessageContent = (content: string) => {
    const parts = content.split(/(\[DOC:[^\]]+\])/g);
    return parts.map((part, index) => {
      if (part.match(/^\[DOC:.+\]$/)) {
        return (
          <span
            key={index}
            className="inline-flex items-center bg-zinc-900 border border-zinc-700 text-zinc-400 text-xs px-2 py-0.5 rounded font-mono mx-1 whitespace-nowrap align-middle"
          >
            {part.slice(5, -1)}
          </span>
        );
      }
      return (
        <span key={index} className="inline prose prose-invert prose-sm max-w-none prose-p:inline prose-p:m-0">
          <ReactMarkdown>
            {part}
          </ReactMarkdown>
        </span>
      );
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-black relative overflow-hidden">
      <header className="p-4 border-b border-[#1a1a1a] flex items-center justify-between bg-black/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <Cpu size={14} className="text-blue-500" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">Neural Stream</span>
            <span className="text-[10px] font-mono tracking-widest text-white px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded">GEMINI 2.0 FLASH</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-[10px] border-zinc-800 text-zinc-500 font-mono tracking-tighter">
            {selectedDocId ? 'ISOLATED MODE' : 'GLOBAL CONTEXT'}
          </Badge>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-white" onClick={() => onConversationChange('')}>
            <RefreshCw size={14} />
          </Button>
        </div>
      </header>

      <ScrollArea ref={scrollRef} className="flex-1 px-4 lg:px-20 py-10 min-h-0">
        <div className="max-w-4xl mx-auto space-y-12 pb-32">
          {messages.length === 0 && !isLoading && (
            <div className="h-[60vh] flex flex-col items-center justify-center gap-6 opacity-40">
              <div className="h-16 w-16 border border-zinc-900 bg-zinc-950 flex items-center justify-center rounded-lg">
                <Command size={32} className="text-zinc-600" />
              </div>
              <p className="text-[10px] font-mono text-zinc-500 tracking-[0.2em] uppercase">Neural Standby</p>
            </div>
          )}

          {messages.map((msg) => (
            <motion.div 
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-2 mb-3">
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-1 rounded-full bg-blue-600" />
                    <span className="text-[10px] font-mono text-white tracking-widest uppercase">Nexus Engine</span>
                  </div>
                )}
                {msg.role === 'user' && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">Requester</span>
                    <div className="h-1 w-1 rounded-full bg-zinc-600" />
                  </div>
                )}
              </div>
              
              <div className={cn(
                "max-w-[90%] p-5 rounded-lg border",
                msg.role === 'user' 
                  ? "bg-zinc-900/40 border-zinc-800 text-white" 
                  : "bg-transparent border-transparent text-white"
              )}>
                {msg.role === 'user' ? (
                  <div className="text-sm leading-relaxed">{msg.content}</div>
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none">
                    {renderMessageContent(msg.content)}
                  </div>
                )}
                {msg.role === 'assistant' && (
                  <div className="mt-8 pt-4 border-t border-zinc-900 flex items-center gap-2 text-[10px] font-mono text-zinc-600 tracking-tighter uppercase">
                    <Zap size={10} className="text-yellow-500" />
                    Neural Stream  •  Gemini 2.0 Flash  •  Institutional Weight Applied
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          {isLoading && (
            <div className="space-y-12">
              {loadStep >= 1 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-start">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-1 w-1 rounded-full bg-blue-600" />
                    <span className="text-[10px] font-mono text-white tracking-widest uppercase">Nexus Engine</span>
                  </div>
                  <div className="space-y-4 w-full">
                    {loadStep >= 2 && (
                      <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-600 tracking-tighter uppercase mb-2">
                        <Zap size={10} className="text-yellow-500" />
                        Neural Stream    GEMINI 2.0 FLASH
                      </div>
                    )}
                    {loadStep >= 3 && (
                      <div className="flex items-center gap-2 text-blue-500 text-xs font-mono tracking-widest neural-dots">
                        EXTRACTING INSTITUTIONAL WEIGHTS
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-6 pb-10 max-w-4xl mx-auto w-full absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/90 to-transparent pointer-events-none">
        <form onSubmit={handleSend} className="relative group pointer-events-auto">
          <input 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={selectedDocId ? "Query this document context..." : "Query the institutional engine..."}
            className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg py-4 pl-6 pr-16 text-sm focus:outline-none focus:border-blue-600 transition-all shadow-2xl group-focus-within:border-zinc-700"
          />
          <button 
            type="submit"
            disabled={!query.trim() || isLoading}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-md bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>
        <p className="text-[9px] text-zinc-600 font-mono tracking-tighter text-center mt-4 uppercase pointer-events-auto">
          Nexus Alpha Institutional Memory Engine  •  Experimental Release 0.1.0  •  Stable Link
        </p>
      </div>
    </div>
  );
}
