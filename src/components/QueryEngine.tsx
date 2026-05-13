import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Message } from '@/lib/supabase';
import { Send, Cpu, User, Loader2, Info, RefreshCw, Command, Zap, FileText } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { authFetch } from '@/lib/api';

const CitationPill = ({ text }: { text: string }) => {
  const [show, setShow] = useState(false);

  return (
    <span
      className="relative inline-flex align-middle mx-0.5"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className={`inline-flex items-center justify-center w-4 h-4 bg-zinc-800 border rounded cursor-pointer transition-colors ${show ? 'border-blue-500 text-blue-400' : 'border-zinc-700 text-zinc-400'}`}>
        <FileText size={9} />
      </span>
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-mono rounded whitespace-nowrap z-50 shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
};

const processChildren = (children: any, citations: string[]): any => {
  if (typeof children === 'string') {
    const parts = children.split(/(%%CITATION_\d+%%)/g);
    return parts.map((part, i) => {
      const match = part.match(/%%CITATION_(\d+)%%/);
      if (match) {
        return <CitationPill key={i} text={citations[parseInt(match[1])]} />;
      }
      return part;
    });
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => <React.Fragment key={i}>{processChildren(child, citations)}</React.Fragment>);
  }
  return children;
};

interface QueryEngineProps {
  selectedDocId: string | null;
  conversationId: string | null;
  onConversationChange: (id: string) => void;
  onMessageSent?: () => void;
  employee: { id: string, name: string, role: string } | null;
}

export default function QueryEngine({ selectedDocId, conversationId, onConversationChange, onMessageSent, employee }: QueryEngineProps) {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    try {
      const res = await authFetch(`/api/conversations/${id}/messages`);
      const data = await res.json();
      if (Array.isArray(data)) setMessages(data);
    } catch (err) {
      console.log('Could not load messages:', err);
      // Don't show error toast — empty conversation is fine
    }
  };

  const createConversation = async () => {
    try {
      const res = await authFetch('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: query.slice(0, 30) || 'New Inquiry' })
      });
      const data = await res.json();
      if (data.id) {
        onConversationChange(data.id);
        onMessageSent?.();
        return data.id;
      }
    } catch (err) {
      toast.error('Conversation initialization failed');
    }
    return null;
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() || isLoading) return;

    setError(null);
    const userQuery = query;
    setQuery('');

    let activeConversationId = conversationId;

    try {
      setIsLoading(true);
      setLoadStep(1);

      // Create conversation if none exists
      if (!activeConversationId) {
        const convRes = await authFetch('/api/conversations', {
          method: 'POST',
          body: JSON.stringify({ title: userQuery.slice(0, 50) })
        });
        const convData = await convRes.json();
        if (convData.id) {
          activeConversationId = convData.id;
          onConversationChange(activeConversationId);
          onMessageSent?.();
        } else {
          throw new Error(convData.error || 'Failed to initialize neural link');
        }
      }

      // Add optimistic user message
      const tempUserMsg: Message = {
        id: `temp-${Date.now()}`,
        conversation_id: activeConversationId!,
        role: 'user',
        content: userQuery,
        created_at: new Date().toISOString(),
        employee_id: employee?.id || ''
      };
      setMessages(prev => [...prev, tempUserMsg]);

      // Animate steps
      setTimeout(() => setLoadStep(2), 800);
      setTimeout(() => setLoadStep(3), 1600);

      // 1. Call Vaultic Neural API
      const res = await authFetch('/api/match-chunks', {
        method: 'POST',
        body: JSON.stringify({
          query: userQuery,
          conversationId: activeConversationId,
          documentId: selectedDocId || null
        })
      });

      const data = await res.json();
      console.log('Neural Response:', data);

      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

      // Add assistant response to UI (messages are saved on server now)
      // We still need to find the latest assistant message to update the UI
      // Or just fetch messages again or trust the 'answer' returned.
      // The user's Step 8 returns { answer }.
      
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        conversation_id: activeConversationId!,
        role: 'assistant',
        content: data.answer,
        employee_id: employee?.id || '',
        created_at: new Date().toISOString()
      };
      
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')).concat(assistantMsg));
      onMessageSent?.();

    } catch (err: any) {
      console.error('Vaultic Send failed:', err);
      setError(`Neural Link Failure: ${err.message}`);
      toast.error(`Neural Link Failure: ${err.message}`);
    } finally {
      setIsLoading(false);
      setLoadStep(0);
    }
  };

  const renderMessageContent = (content: string) => {
    // Split content by citation tags
    const parts = content.split(/(\[DOC:[^\]]+\])/g);
    
    // Reconstruct content replacing citations with placeholder tokens
    const citations: string[] = [];
    const processed = parts.map(part => {
      if (part.match(/^\[DOC:.+\]$/)) {
        citations.push(part.slice(1, -1));
        return `%%CITATION_${citations.length - 1}%%`;
      }
      return part;
    }).join('');

    // Render with ReactMarkdown then replace placeholders with pills
    return (
      <div className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-li:my-0.5 prose-headings:my-3 prose-headings:font-semibold prose-strong:text-white prose-code:text-zinc-300 prose-code:bg-zinc-800 prose-code:px-1 prose-code:rounded">
        <ReactMarkdown
          components={{
            p: ({ children }) => (
              <p className="my-2 leading-relaxed">
                {processChildren(children, citations)}
              </p>
            ),
            li: ({ children }) => (
              <li className="my-1">
                {processChildren(children, citations)}
              </li>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-white">
                {processChildren(children, citations)}
              </strong>
            ),
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
            <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">Vaultic Neural Core</span>
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
                    <div className="h-1 w-1 rounded-full bg-zinc-800" />
                    <div>Model: Gemini 2.5 Flash</div>
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
        {error && (
          <div className="mb-4 p-3 bg-red-950/20 border border-red-900/50 rounded-lg text-red-400 text-[10px] font-mono uppercase tracking-widest flex items-center gap-2 pointer-events-auto">
            <Info size={12} />
            {error}
          </div>
        )}
        <form onSubmit={handleSend} className="relative group pointer-events-auto">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-900/20 to-zinc-800/20 rounded-xl blur opacity-30 group-focus-within:opacity-100 transition-opacity" />
          <input 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && query.trim()) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={selectedDocId ? "Ask the document..." : "Ask the institution..."}
            className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl py-5 pl-6 pr-16 text-[14px] focus:outline-none focus:border-zinc-700 transition-all shadow-2xl relative placeholder:text-zinc-700 disabled:opacity-50"
            disabled={isLoading}
          />
          <button 
            type="submit"
            disabled={!query.trim() || isLoading}
            className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 flex items-center justify-center rounded-lg bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-900 disabled:text-zinc-700 transition-all shadow-xl",
              (!query.trim() || isLoading) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
            )}
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>
        <div className="flex items-center justify-between mt-4 px-1 pointer-events-auto">
          <p className="text-[8px] text-zinc-700 font-mono tracking-tighter uppercase">
            Institutional Memory v0.1.2_Build-Vaultic
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
