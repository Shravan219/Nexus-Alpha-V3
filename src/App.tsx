import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Document, Conversation } from '@/lib/supabase';
import Sidebar from '@/components/Sidebar';
import Dashboard from '@/components/Dashboard';
import Vault from '@/components/Vault';
import QueryEngine from '@/components/QueryEngine';
import { Toaster } from 'sonner';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'vault' | 'query'>('dashboard');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const fetchDocs = async () => {
    const { data } = await supabase.from('documents').select('*').order('created_at', { ascending: false });
    if (data) setDocuments(data);
  };

  const fetchConversations = async () => {
    const { data } = await supabase.from('conversations').select('*').order('created_at', { ascending: false });
    if (data) setConversations(data);
  };

  useEffect(() => {
    fetchDocs();
    fetchConversations();
    
    // Subscribe to changes
    const docSub = supabase.channel('docs').on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, fetchDocs).subscribe();
    return () => {
      supabase.removeChannel(docSub);
    };
  }, []);

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        documents={documents}
        selectedDocId={selectedDocId}
        setSelectedDocId={setSelectedDocId}
      />
      
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {activeTab === 'dashboard' && <Dashboard documents={documents} conversations={conversations} onNavigateToDocs={() => setActiveTab('vault')} />}
        {activeTab === 'vault' && <Vault documents={documents} onRefresh={fetchDocs} />}
        {activeTab === 'query' && (
          <QueryEngine 
            selectedDocId={selectedDocId} 
            conversationId={activeConversationId} 
            onConversationChange={setActiveConversationId}
          />
        )}
      </main>
      <Toaster theme="dark" position="top-right" />
    </div>
  );
}
