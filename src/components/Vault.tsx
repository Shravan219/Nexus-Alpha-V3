import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '@/lib/supabase';
import type { Document } from '@/lib/supabase';
import { FileText, Upload, Trash2, Loader2, RefreshCw, PlusCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { authFetch } from '@/lib/api';

interface VaultProps {
  documents: Document[];
  onRefresh: () => void;
  isAdmin?: boolean;
}

export default function Vault({ documents, onRefresh, isAdmin = false }: VaultProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [isPasteOpen, setIsPasteOpen] = useState(false);

  const processDocument = async (docId: string, fileUrl: string, filename: string) => {
    try {
      const response = await authFetch('/api/process-document', {
        method: 'POST',
        body: JSON.stringify({
          documentId: docId,
          fileUrl,
          filename
        })
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || `Server error: ${response.status}`);
      }

      toast.success(`${filename} processed successfully`);
      onRefresh();
    } catch (error: any) {
      console.error(error);
      toast.error(`Processing failed: ${error.message}`);
      onRefresh();
    }
  };

  const deleteDocument = async (doc: Document) => {
    if (!confirm(`Purge ${doc.name} and all associated neural weights?`)) return;
    try {
      const res = await authFetch(`/api/documents/${doc.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || `Purge failed with status ${res.status}`);
      }
      
      toast.success(`${doc.name} purged from vault`);
      onRefresh();
    } catch (error: any) {
      toast.error(`Deletion failed: ${error.message}`);
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setIsUploading(true);
    for (const file of acceptedFiles) {
      const isPdf = file.type === 'application/pdf';
      const isText = file.type === 'text/plain' || file.type === 'text/markdown';
      
      if (!isPdf && !isText) {
        toast.error(`Unsupported file type: ${file.name}`);
        continue;
      }

      try {
        const fileExt = file.name.split('.').pop();
        const filePath = `${Math.random()}.${fileExt}`;
        
        const { data, error: uploadError } = await supabase.storage
          .from('knowledge-vault')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('knowledge-vault')
          .getPublicUrl(filePath);

        const { data: docData, error: dbError } = await supabase.from('documents').insert({
          name: file.name,
          content_type: file.type,
          size_bytes: file.size,
          status: 'pending'
        }).select().single();

        if (dbError) throw dbError;

        toast.info(`Intake successful for ${file.name}. Commencing neural extraction...`);
        processDocument(docData.id, publicUrl, file.name);
      } catch (error: any) {
        toast.error(`Upload error: ${error.message}`);
      }
    }
    setIsUploading(false);
    onRefresh();
  }, [onRefresh]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const handleManualIngest = async () => {
    if (!pasteTitle || !pasteText) return;
    
    setIsPasteOpen(false);
    toast.info('Commencing manual text ingestion...');
    
    try {
      const { data: docData, error: dbError } = await supabase.from('documents').insert({
        name: `${pasteTitle}.txt`,
        content_type: 'text/plain',
        size_bytes: pasteText.length,
        status: 'processing'
      }).select().single();

      if (dbError) throw dbError;

      // For plain text, we can chunk directly in the edge function or simulate URL
      // Here we'll use a data URL for simplicity skip storage
      const dataUrl = `data:text/plain;base64,${btoa(pasteText)}`;
      processDocument(docData.id, dataUrl, `${pasteTitle}.txt`);
      
      setPasteText('');
      setPasteTitle('');
    } catch (error: any) {
      toast.error(`Manual ingestion failed: ${error.message}`);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-10 space-y-10">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h2 className="text-4xl font-bold tracking-tighter text-white">Knowledge Vault</h2>
          <p className="text-zinc-500 font-mono text-sm tracking-widest uppercase">Institutional Library & Data Sovereignty</p>
        </div>
        <div className="flex gap-3">
          {isAdmin && (
            <Dialog open={isPasteOpen} onOpenChange={setIsPasteOpen}>
              <DialogTrigger 
                render={
                  <Button variant="outline" className="bg-zinc-950 border-zinc-900 hover:bg-zinc-900 gap-2 h-10 px-4 font-mono text-[10px] tracking-widest uppercase">
                    <PlusCircle size={14} />
                    PASTE PROTOCOL
                  </Button>
                }
              />
              <DialogContent className="bg-zinc-950 border-zinc-900 text-white max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="font-mono tracking-widest uppercase text-sm">Direct Data Ingest</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">Document Title</label>
                    <input 
                      value={pasteTitle}
                      onChange={(e) => setPasteTitle(e.target.value)}
                      className="w-full bg-black border border-zinc-900 rounded-md p-2 text-sm focus:outline-none focus:border-blue-600 transition-colors"
                      placeholder="Engineering-SOP-V1"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">Plaintext / Markdown Content</label>
                    <textarea 
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      className="w-full bg-black border border-zinc-900 rounded-md p-4 text-sm focus:outline-none focus:border-blue-600 transition-colors min-h-[300px] font-mono"
                      placeholder="Paste the raw institutional weights here..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleManualIngest} className="bg-white text-black hover:bg-zinc-200">INITIATE INGEST</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          
          <Button onClick={onRefresh} variant="outline" size="icon" className="bg-zinc-950 border-zinc-900">
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {isAdmin && (
          <Card className="bg-[#0a0a0a] border-[#1a1a1a] border-dashed">
            <CardContent className="p-0">
              <div 
                {...getRootProps()} 
                className={`p-16 text-center cursor-pointer transition-all ${isDragActive ? 'bg-blue-600/5 border-blue-600' : 'hover:bg-zinc-900/40'}`}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-zinc-950 border border-zinc-900 flex items-center justify-center">
                    {isUploading ? <Loader2 className="animate-spin text-blue-500" size={32} /> : <Upload className="text-zinc-500" size={32} />}
                  </div>
                  <div>
                    <p className="text-lg font-bold tracking-tight">INGEST PIPELINE</p>
                    <p className="text-zinc-500 text-sm mt-1">Drop institutional weights (PDF, TXT, MD) or click to browse</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-[#0a0a0a] border-[#1a1a1a] text-white">
          <CardHeader className="border-b border-[#1a1a1a]">
            <CardTitle className="text-sm font-mono tracking-widest uppercase">Institutional Library</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              {documents.length === 0 ? (
                <div className="p-20 text-center flex flex-col items-center gap-4 opacity-30">
                  <FileText size={48} />
                  <p className="text-lg font-bold uppercase tracking-widest">Vault Empty</p>
                </div>
              ) : (
                <div className="divide-y divide-[#1a1a1a]">
                  {documents.map(doc => (
                    <div key={doc.id} className="p-6 flex items-center justify-between group hover:bg-zinc-900/50 transition-colors">
                      <div className="flex items-center gap-6">
                        <div className={`h-12 w-12 rounded border flex items-center justify-center ${doc.status === 'error' ? 'border-red-500/20 bg-red-500/5' : 'border-zinc-800 bg-zinc-950'}`}>
                          <FileText size={20} className={doc.status === 'error' ? 'text-red-500' : 'text-zinc-400'} />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-bold text-sm leading-none">{doc.name}</h3>
                            <div className={`h-1.5 w-1.5 rounded-full ${doc.status === 'ready' ? 'bg-green-500' : doc.status === 'processing' ? 'bg-yellow-500 animate-pulse' : doc.status === 'pending' ? 'bg-zinc-500' : 'bg-red-500'}`} />
                          </div>
                          <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-500 uppercase tracking-tighter">
                            <span>{(doc.size_bytes / 1024 / 1024).toFixed(2)} MB</span>
                            <span>•</span>
                            <span>{doc.chunk_count || 0} Chunks</span>
                            <span>•</span>
                            <span>Uploaded {formatDistanceToNow(new Date(doc.created_at))} ago</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        {doc.error_message && (
                          <div className="text-[10px] font-mono text-red-500 bg-red-500/5 border border-red-500/10 px-2 py-1 rounded max-w-[200px] truncate">
                            {doc.error_message}
                          </div>
                        )}
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-zinc-500 hover:text-red-500 hover:bg-red-500/10"
                            onClick={() => deleteDocument(doc)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
