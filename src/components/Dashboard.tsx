import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Dashboard from './components/Dashboard';
import ActivationModal from './components/ActivationModal';
import LoginScreen from './components/LoginScreen'; // Or your existing login component

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [licenseKey, setLicenseKey] = useState('TEST-KEY-123'); // Hardcoded or pulled from context
  const [isPaid, setIsPaid] = useState<boolean | null>(null);

  // 1. Initial check on load
  useEffect(() => {
    async function checkLicenseStatus() {
      const { data, error } = await supabase
        .from('licenses')
        .select('transaction_hash')
        .eq('license_key', licenseKey)
        .single();

      if (data && data.transaction_hash && data.transaction_hash.startsWith('0x')) {
        setIsPaid(true);
      } else {
        setIsPaid(false);
      }
    }
    checkLicenseStatus();
  }, [licenseKey]);

  // Loading state while checking database
  if (isPaid === null) return <div className="min-h-screen bg-black text-white p-10 font-mono">Verifying Gateway Status...</div>;

  // ➔ STEP 1: If not paid, user ONLY sees the payment screen. No dashboard layout exists yet.
  if (!isPaid) {
    return (
      <ActivationModal 
        licenseKey={licenseKey} 
        onPaymentComplete={() => setIsPaid(true)} // 🟢 Force the immediate component swap
      />
    );
  }

  // ➔ STEP 2: Once isPaid is TRUE, the payment screen completely unmounts, and they see the Login screen
  if (!session) {
    return <LoginScreen onLoginSuccess={() => setSession(true)} />;
  }

  // ➔ STEP 3: After login, they access the operational dashboard
  return <Dashboard licenseKey={licenseKey} isLicenseActive={true} documents={[]} conversations={[]} onNavigateToDocs={() => {}} />;
}