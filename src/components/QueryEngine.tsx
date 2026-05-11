import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Message } from '@/lib/supabase';
import { Send, Cpu, User, Loader2, Database, Info, RefreshCw, Command, Zap } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
    // If it looks like JSON, it's a failure mode
    if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.answer) return renderMessageContent(parsed.answer);
      } catch (e) {
        // Not actual JSON
      }
    }

    // Pre-process citations into unique markdown links
    // [DOC: file | Page 1] -> [DOC: file | Page 1](cite:file%20|%20Page%201)
    const processed = content.replace(/\[DOC: ([^\]]+)\]/g, (match, p1) => {
      const citeText = `DOC: ${p1}`;
      return `[${citeText}](cite:${encodeURIComponent(p1)})`;
    });

    return (
      <div className="prose prose-invert prose-sm max-w-none 
        prose-p:leading-relaxed prose-p:mb-5 
        prose-headings:mt-8 prose-headings:mb-4 prose-headings:text-zinc-100 prose-headings:font-semibold
        prose-strong:text-white prose-strong:font-bold
        prose-ul:my-6 prose-ul:list-disc prose-ul:pl-6
        prose-li:mb-2 prose-li:marker:text-zinc-600
        prose-code:text-blue-400 prose-code:bg-zinc-900/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
        last:prose-p:mb-0"
      >
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => {
              if (href?.startsWith('cite:')) {
                return (
                  <span
                    className="inline-flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 text-zinc-400 text-[10px] px-2 py-0.5 rounded-full font-mono mx-1 whitespace-nowrap align-middle hover:border-blue-900/50 hover:text-blue-400 transition-colors cursor-help group/cite select-none"
                    title={decodeURIComponent(href.slice(5))}
                  >
                    <Database size={10} className="text-zinc-600 group-hover/cite:text-blue-500" />
                    {children}
                  </span>
                );
              }
              return (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline decoration-blue-900/50 underline-offset-4 transition-colors">
                  {children}
                </a>
              );
            }
          }}
        >
          {processed}
        </ReactMarkdown>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-black relative overflow-hidden">
      <header className="p-4 border-b border-[#1a1a1a] flex items-center justify-between bg-black/80 backdrop-blur-xl z-20">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Cpu size={14} className="text-blue-500" />
            <motion.div 
              animate={{ opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 blur-[2px]" 
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">Nexus Neural Core</span>
            <span className="text-[9px] font-mono tracking-widest text-white/50 px-1.5 py-0.5 bg-zinc-950 border border-zinc-900 rounded select-none">v0.1.2-ALPHA</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-[9px] border-zinc-800 text-zinc-500 font-mono tracking-tighter uppercase px-2 py-0">
            {selectedDocId ? 'Isolated Mode' : 'Grounding: Global'}
          </Badge>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-600 hover:text-white hover:bg-zinc-900 rounded-full" onClick={() => onConversationChange('')}>
            <RefreshCw size={13} />
          </Button>
        </div>
      </header>

      <ScrollArea ref={scrollRef} className="flex-1 px-4 lg:px-0 py-0 min-h-0">
        <div className="max-w-3xl mx-auto space-y-10 py-16 pb-40">
          {messages.length === 0 && !isLoading && (
            <div className="h-[50vh] flex flex-col items-center justify-center gap-6">
              <div className="relative">
                <div className="h-20 w-20 border border-zinc-900 bg-zinc-950/50 flex items-center justify-center rounded-2xl rotate-45 shadow-[0_0_50px_rgba(0,0,0,1)]">
                  <span className="rotate-[-45deg]">
                    <Command size={32} className="text-zinc-700" />
                  </span>
                </div>
                <div className="absolute -inset-4 bg-blue-500/5 blur-3xl rounded-full" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-[10px] font-mono text-zinc-500 tracking-[0.4em] uppercase">Neural Engine Online</p>
                <p className="text-xs text-zinc-700 font-mono italic">Awaiting institutional inquiry...</p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <motion.div 
              key={msg.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex flex-col group",
                msg.role === 'user' ? 'items-end pl-12' : 'items-start pr-12'
              )}
            >
              <div className="flex items-center gap-3 mb-2 px-1">
                {msg.role === 'assistant' && (
                  <>
                    <div className="h-6 w-6 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-inner">
                      <Cpu size={12} className="text-blue-500" />
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">Institutional Agent</span>
                  </>
                )}
                {msg.role === 'user' && (
                  <>
                    <span className="text-[10px] font-mono text-zinc-600 tracking-widest uppercase text-right">Corporate Identity</span>
                    <div className="h-6 w-6 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
                      <User size={12} className="text-zinc-400" />
                    </div>
                  </>
                )}
              </div>
              
              <div className={cn(
                "relative group-hover:border-zinc-700 transition-colors duration-300",
                msg.role === 'user' 
                  ? "p-4 rounded-2xl rounded-tr-sm bg-zinc-900/60 border border-zinc-800/50 text-zinc-100 shadow-sm" 
                  : "w-full p-6 rounded-2xl rounded-tl-sm bg-[#050505] border border-zinc-900/50 text-zinc-200"
              )}>
                {msg.role === 'user' ? (
                  <div className="text-[14px] leading-relaxed font-sans">{msg.content}</div>
                ) : (
                  <div className="space-y-4">
                    {renderMessageContent(msg.content)}
                  </div>
                )}
                
                {msg.role === 'assistant' && (
                  <div className="mt-8 pt-4 border-t border-zinc-900/50 flex flex-wrap items-center gap-x-4 gap-y-2 text-[9px] font-mono text-zinc-600 tracking-tighter uppercase">
                    <div className="flex items-center gap-1.5">
                      <Zap size={10} className="text-yellow-600/80" />
                      Neural Link Localized
                    </div>
                    <div className="h-1 w-1 rounded-full bg-zinc-800" />
                    <div>Grounding Strength: High</div>
                    <div className="h-1 w-1 rounded-full bg-zinc-800" />
                    <div>Execution Time: 2.1s</div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          {isLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-start pr-12">
              <div className="flex items-center gap-3 mb-2 px-1">
                <div className="h-6 w-6 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center animate-pulse">
                  <Cpu size={12} className="text-blue-500" />
                </div>
                <span className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">Processing</span>
              </div>
              <div className="w-full h-32 rounded-2xl rounded-tl-sm bg-[#050505] border border-zinc-900/50 p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-ping" />
                  <span className="text-[10px] font-mono text-blue-500 tracking-widest uppercase">
                    {loadStep === 1 ? 'Initializing Link' : loadStep === 2 ? 'Streaming Fragments' : 'Extracting Context'}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="h-2 w-3/4 bg-zinc-900 rounded animate-pulse" />
                  <div className="h-2 w-1/2 bg-zinc-900 rounded animate-pulse delay-75" />
                  <div className="h-2 w-2/3 bg-zinc-900 rounded animate-pulse delay-150" />
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      <div className="p-6 pb-12 max-w-3xl mx-auto w-full absolute bottom-0 left-0 right-0 z-30 pointer-events-none bg-gradient-to-t from-black via-black/95 to-transparent">
        <form onSubmit={handleSend} className="relative group pointer-events-auto">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-900/20 to-zinc-800/20 rounded-xl blur opacity-30 group-focus-within:opacity-100 transition-opacity" />
          <input 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={selectedDocId ? "Ask the document..." : "Ask the institution..."}
            className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl py-5 pl-6 pr-16 text-[14px] focus:outline-none focus:border-zinc-700 transition-all shadow-2xl relative placeholder:text-zinc-700"
          />
          <button 
            type="submit"
            disabled={!query.trim() || isLoading}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 flex items-center justify-center rounded-lg bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-900 disabled:text-zinc-700 transition-all shadow-xl"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>
        <div className="flex items-center justify-between mt-4 px-1 pointer-events-auto">
          <p className="text-[8px] text-zinc-700 font-mono tracking-tighter uppercase">
            Institutional Memory v0.1.2_Build-Nexus
          </p>
          <div className="flex items-center gap-1.5 opacity-30 hover:opacity-100 transition-opacity">
            <div className="h-1 w-1 rounded-full bg-green-500" />
            <span className="text-[8px] text-zinc-600 font-mono tracking-tighter uppercase">Neural Link Stable</span>
          </div>
        </div>
      </div>
    </div>
  );
}
