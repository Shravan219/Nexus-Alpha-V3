import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Document, Conversation } from '@/lib/supabase';
import { FileText, Cpu, MessageSquareText, ShieldCheck, Database, Zap, BookOpen } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import ActivationModal from '@/components/ActivationModal';

interface DashboardProps {
  documents: Document[];
  conversations: Conversation[];
  onNavigateToDocs: () => void;
}

export default function Dashboard({ documents, conversations, onNavigateToDocs }: DashboardProps) {
  const totalChunks = documents.reduce((acc, doc) => acc + (doc.chunk_count || 0), 0);

  return (
    <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">

    <ActivationModal /> 
    
      <div className="space-y-2">
        <h2 className="text-4xl font-bold tracking-tighter">Operational Overview</h2>
        <p className="text-zinc-500 font-mono text-sm tracking-widest uppercase">System Metrics & Vital Signs</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<FileText className="text-blue-500" />} label="Total Documents" value={documents.length} />
        <StatCard icon={<Database className="text-zinc-400" />} label="Knowledge Chunks" value={totalChunks.toLocaleString()} />
        <StatCard icon={<MessageSquareText className="text-zinc-400" />} label="Conversations" value={conversations.length} />
        <StatCard icon={<ShieldCheck className="text-green-500" />} label="Vector DB Active" value="ONLINE" status="active" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="bg-[#0a0a0a] border-[#1a1a1a] text-white">
          <CardHeader className="border-b border-[#1a1a1a]">
            <CardTitle className="text-sm font-mono tracking-widest uppercase flex items-center justify-between">
              Recent Intakes
              <button onClick={onNavigateToDocs} className="text-[10px] text-blue-500 hover:underline">View Vault</button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {documents.length === 0 ? (
              <div className="p-10 text-center text-zinc-600 text-sm">No data in pipeline</div>
            ) : (
              <div className="divide-y divide-[#1a1a1a]">
                {documents.slice(0, 5).map(doc => (
                  <div key={doc.id} className="p-4 flex items-center justify-between hover:bg-zinc-900/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded bg-zinc-900 flex items-center justify-center">
                        <FileText size={14} className="text-zinc-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium truncate max-w-[200px]">{doc.name}</p>
                        <p className="text-[10px] text-zinc-500">{formatDistanceToNow(new Date(doc.created_at))} ago</p>
                      </div>
                    </div>
                    <div className={cn(
                      "text-[10px] font-mono px-2 py-0.5 rounded border",
                      doc.status === 'ready' ? "border-green-500/20 text-green-500" : 
                      doc.status === 'processing' ? "border-yellow-500/20 text-yellow-500" :
                      "border-red-500/20 text-red-500"
                    )}>
                      {doc.status.toUpperCase()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#0a0a0a] border-[#1a1a1a] text-white">
          <CardHeader className="border-b border-[#1a1a1a]">
            <CardTitle className="text-sm font-mono tracking-widest uppercase">System Protocol</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="flex gap-4">
              <div className="mt-1 h-2 w-2 rounded-full bg-blue-600 shrink-0" />
              <div>
                <p className="text-sm font-bold">1. Ingestion Pipeline</p>
                <p className="text-xs text-zinc-500 mt-1">Upload institutional PDFs. The engine extracts text and generates high-dimensional embeddings via Gemini gemini-embedding-001.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="mt-1 h-2 w-2 rounded-full bg-blue-600 shrink-0" />
              <div>
                <p className="text-sm font-bold">2. Semantic Indexing</p>
                <p className="text-xs text-zinc-500 mt-1">Vectors are stored in pgvector. Every query triggers a similarity search to find the most relevant institutional fragments.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="mt-1 h-2 w-2 rounded-full bg-blue-600 shrink-0" />
              <div>
                <p className="text-sm font-bold">3. Grounded Synthesis</p>
                <p className="text-xs text-zinc-500 mt-1">Gemini 2.5 Flash synthesizes answers using ONLY found context, including mandatory filename and page citations.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, status }: { icon: React.ReactNode, label: string, value: string | number, status?: string }) {
  return (
    <Card className="bg-[#0a0a0a] border-[#1a1a1a] text-white hover:border-zinc-800 transition-all group">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="h-10 w-10 rounded-lg bg-zinc-950 border border-zinc-900 flex items-center justify-center group-hover:scale-110 transition-transform">
            {icon}
          </div>
          {status && (
            <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px] font-mono">
              STABLE
            </Badge>
          )}
        </div>
        <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{label}</p>
        <p className="text-3xl font-bold tracking-tighter mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
