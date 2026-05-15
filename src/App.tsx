import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Document, Conversation } from '@/lib/supabase';
import Sidebar from '@/components/Sidebar';
import Dashboard from '@/components/Dashboard';
import Vault from '@/components/Vault';
import QueryEngine from '@/components/QueryEngine';
import { Login } from '@/components/Login';
import AdminPanel from '@/components/AdminPanel';
import { Toaster, toast } from 'sonner';
import { authFetch } from '@/lib/api';
import { SESSION_TOKEN_KEY, SESSION_EMPLOYEE_KEY } from '@/lib/constants';
import { useVaulticGate } from '@/hooks/useVaulticGate';
import { motion } from 'motion/react';

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

  // Ping server every 10 minutes to keep it alive
  useEffect(() => {
    const ping = () => fetch('/api/ping').catch(() => {});
    ping(); // ping on load
    const interval = setInterval(ping, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
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
        sessionStorage.setItem(SESSION_EMPLOYEE_KEY, JSON.stringify(data.employee));
      } else {
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
        sessionStorage.removeItem(SESSION_EMPLOYEE_KEY);
      }
    } catch (err) {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
      sessionStorage.removeItem(SESSION_EMPLOYEE_KEY);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleLogin = (employee: any) => {
    setIsLoggedIn(true);
    setCurrentUser(employee);
    toast.success(`Welcome back, Agent ${employee.name}`);
  };

  const handleLogout = async () => {
    await authFetch('/api/auth/logout', { method: 'POST' });
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_EMPLOYEE_KEY);
    setIsLoggedIn(false);
    setCurrentUser(null);
    setActiveTab('dashboard');
    toast.info('Session terminated');
  };

  const { isValidating: isLicenseValidating, isAuthorized } = useVaulticGate();

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

  if (isLicenseValidating) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-neutral-400 font-mono">
        <motion.div 
          animate={{ opacity: [0.4, 1, 0.4] }} 
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="tracking-widest text-xs uppercase"
        >
          Verifying Institutional Core Link...
        </motion.div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-black text-white px-6 font-mono selection:bg-red-500/30">
        <div className="border border-red-500/20 bg-red-950/10 p-8 rounded-sm max-w-md text-center backdrop-blur-md">
          <h1 className="text-red-500 uppercase tracking-wider text-sm font-bold mb-2">
            [ SYSTEM TERMINATED ]
          </h1>
          <p className="text-neutral-400 text-xs leading-relaxed mb-6">
            This Vaultic instance lacks a verified distribution license or the associated monthly retainer has expired. 
          </p>
          <div className="text-[10px] text-neutral-600 border-t border-neutral-900 pt-4">
            Contact operator: @glitchyphantom
          </div>
        </div>
      </div>
    );
  }

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
            employee={currentUser}
          />
        )}
      </main>
      <Toaster theme="dark" position="top-right" />
    </div>
  );
}
