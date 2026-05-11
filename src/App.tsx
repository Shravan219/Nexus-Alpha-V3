import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Document, Conversation } from '@/lib/supabase';
import Sidebar from '@/components/Sidebar';
import Dashboard from '@/components/Dashboard';
import Vault from '@/components/Vault';
import QueryEngine from '@/components/QueryEngine';
import Login from '@/components/Login';
import AdminPanel from '@/components/AdminPanel';
import { Toaster, toast } from 'sonner';
import { authFetch } from '@/lib/api';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'vault' | 'query' | 'admin'>('dashboard');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<{id: string, name: string, role: string} | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);

  const fetchDocs = async () => {
    const { data } = await supabase.from('documents').select('*').order('created_at', { ascending: false });
    if (data) setDocuments(data);
  };

  const fetchConversations = async () => {
    try {
      const res = await authFetch('/api/conversations');
      const data = await res.json();
      if (Array.isArray(data)) setConversations(data);
    } catch (err) {
      console.error('Fetch failed');
    }
  };

  const verifySession = async () => {
    const token = sessionStorage.getItem('nexus_token');
    if (!token) {
      setIsVerifying(false);
      return;
    }

    try {
      const res = await authFetch('/api/auth/verify');
      const data = await res.json();
      if (data.success) {
        setIsLoggedIn(true);
        setCurrentUser(data.employee);
      } else {
        sessionStorage.removeItem('nexus_token');
      }
    } catch (err) {
      sessionStorage.removeItem('nexus_token');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleLogin = (token: string, employee: any) => {
    sessionStorage.setItem('nexus_token', token);
    setIsLoggedIn(true);
    setCurrentUser(employee);
    toast.success(`Welcome back, Agent ${employee.name}`);
  };

  const handleLogout = async () => {
    await authFetch('/api/auth/logout', { method: 'POST' });
    sessionStorage.removeItem('nexus_token');
    setIsLoggedIn(false);
    setCurrentUser(null);
    setActiveTab('dashboard');
    toast.info('Session terminated');
  };

  useEffect(() => {
    verifySession();
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchDocs();
      fetchConversations();
      
      const docSub = supabase.channel('docs').on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, fetchDocs).subscribe();
      return () => {
        supabase.removeChannel(docSub);
      };
    }
  }, [isLoggedIn]);

  if (isVerifying) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="h-1 w-12 bg-blue-600 mx-auto animate-pulse" />
          <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest">Verifying Neural Link...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <>
        <Login onLogin={handleLogin} />
        <Toaster theme="dark" position="top-right" />
      </>
    );
  }

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        documents={documents}
        selectedDocId={selectedDocId}
        setSelectedDocId={setSelectedDocId}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
      
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {activeTab === 'dashboard' && <Dashboard documents={documents} conversations={conversations} onNavigateToDocs={() => setActiveTab('vault')} />}
        {activeTab === 'vault' && <Vault documents={documents} onRefresh={fetchDocs} isAdmin={currentUser?.role === 'admin'} />}
        {activeTab === 'admin' && currentUser?.role === 'admin' && <AdminPanel />}
        {activeTab === 'query' && (
          <QueryEngine 
            selectedDocId={selectedDocId} 
            conversationId={activeConversationId} 
            onConversationChange={setActiveConversationId}
            onMessageSent={fetchConversations}
          />
        )}
      </main>
      <Toaster theme="dark" position="top-right" />
    </div>
  );
}
