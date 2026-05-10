import React from 'react';
import { Database, FolderHeart, MessageSquareText, Search, Activity, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Document } from '@/lib/supabase';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  documents: Document[];
  selectedDocId: string | null;
  setSelectedDocId: (id: string | null) => void;
}

export default function Sidebar({ activeTab, setActiveTab, documents, selectedDocId, setSelectedDocId }: SidebarProps) {
  return (
    <aside className="w-72 bg-[#0a0a0a] border-r border-[#1a1a1a] flex flex-col h-full">
      <div className="p-6 border-b border-[#1a1a1a] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-[3px] bg-blue-600" />
          <h1 className="text-xl font-bold tracking-tighter text-white">NEXUS ALPHA</h1>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] font-mono text-green-500/80 tracking-widest">STABLE</span>
        </div>
      </div>

      <nav className="p-4 space-y-1">
        <SidebarNavItem 
          icon={<Activity size={18} />} 
          label="DASHBOARD" 
          active={activeTab === 'dashboard'} 
          onClick={() => setActiveTab('dashboard')} 
        />
        <SidebarNavItem 
          icon={<FolderHeart size={18} />} 
          label="KNOWLEDGE VAULT" 
          active={activeTab === 'vault'} 
          onClick={() => setActiveTab('vault')} 
        />
        <SidebarNavItem 
          icon={<Cpu size={18} />} 
          label="NEURAL ENGINE" 
          active={activeTab === 'query'} 
          onClick={() => setActiveTab('query')} 
        />
      </nav>

      <div className="mt-8 flex-1 flex flex-col overflow-hidden">
        <div className="px-6 pb-2">
          <p className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">Institutional Context</p>
        </div>
        
        <div className="px-4 mb-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input 
              placeholder="Search Knowledge..." 
              className="w-full bg-zinc-950 border border-zinc-900 rounded-md py-1.5 pl-9 pr-4 text-xs focus:outline-none focus:border-zinc-800 transition-colors"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 px-4">
          <div className="space-y-1 pb-6">
            <button 
              onClick={() => setSelectedDocId(null)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-md text-xs transition-all flex items-center justify-between group",
                selectedDocId === null ? "bg-zinc-900/50 text-white" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <div className="flex items-center gap-2">
                <Database size={14} />
                <span>Global Repository</span>
              </div>
              {selectedDocId === null && <div className="h-1 w-1 rounded-full bg-blue-600" />}
            </button>

            {documents.filter(d => d.status === 'ready').map(doc => (
              <button 
                key={doc.id}
                onClick={() => {
                  setSelectedDocId(doc.id);
                  setActiveTab('query');
                }}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-xs transition-all border-l-2 flex items-center justify-between",
                  selectedDocId === doc.id ? "bg-blue-600/5 border-blue-600 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
                )}
              >
                <div className="flex-1 truncate mr-2">
                  {doc.name}
                </div>
                <Badge variant="outline" className="text-[9px] h-4 px-1 lowercase border-zinc-800 text-zinc-500">
                  {doc.content_type.split('/')[1] || 'doc'}
                </Badge>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="p-4 border-t border-[#1a1a1a]">
        <div className="bg-zinc-900/30 rounded-lg p-3 border border-zinc-900">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold">
              SYS
            </div>
            <div>
              <p className="text-[11px] font-bold">Root System</p>
              <p className="text-[9px] text-zinc-500 uppercase tracking-tighter">Institutional Overseer</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function SidebarNavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-mono tracking-widest transition-all",
        active ? "bg-white text-black" : "text-zinc-400 hover:bg-zinc-900"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
