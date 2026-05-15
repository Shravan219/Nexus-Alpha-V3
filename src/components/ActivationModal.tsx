import React, { useState } from 'react';
import { supabase } from '@/lib/supabase'; // Make sure this path points to your supabase client config

const DEVELOPER_WALLET = "0x2F5146bBC23a07EEB3149A5E12E94396000D9EF5"; 
const TEST_PRICE_HEX = "0x2386F26FC10000"; // 0.01 POL

interface ActivationModalProps {
  licenseKey: string;
  onVerificationSuccess: () => void; // Callback to tell Dashboard to instantly hide the wall
}

export default function ActivationModal({ licenseKey, onVerificationSuccess }: ActivationModalProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const handleSignAndPay = async () => {
    if (typeof window !== 'undefined' && !window.ethereum) {
      alert("Please install MetaMask to proceed.");
      return;
    }

    try {
      setLoading(true);
      setStatus("Connecting wallet...");

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const userWallet = accounts[0];

      // 1. Legal Contract Signature
      setStatus("Awaiting signature...");
      const agreementText = `BY SIGNING, YOU ARE UNLOCKING ACCESS ROUTE FOR KEY: ${licenseKey}`;
      await window.ethereum.request({
        method: 'personal_sign',
        params: [agreementText, userWallet],
      });

      // 2. Process Blockchain Payment
      setStatus("Processing network payment...");
      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: userWallet,
          to: DEVELOPER_WALLET,
          value: TEST_PRICE_HEX,
        }],
      });

      setStatus("Updating deployment records...");

      // 3. 🤖 AUTOMATION TRIGGER: Automatically update Supabase immediately!
      const { error } = await supabase
        .from('licenses')
        .update({
          is_active: true,
          transaction_hash: txHash,
          payment_received_at: new Date().toISOString()
        })
        .eq('license_key', licenseKey);

      if (error) throw error;

      setStatus("Complete!");
      alert("Workspace activated automatically!");
      
      // Trigger the frontend state refresh instantly
      onVerificationSuccess();

    } catch (error: any) {
      console.error("Automation Failure:", error);
      setStatus("Transaction failed or database sync blocked.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 text-white font-sans">
      <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-xl max-w-md w-full text-center space-y-6">
        <h2 className="text-xl font-bold tracking-tight">Vaultic Activation Required</h2>
        <p className="text-sm text-zinc-400">
          License Key <code className="text-orange-500 font-mono">{licenseKey}</code> is locked. Please process the validation payment to automatically unlock the dashboard workspace.
        </p>
        
        <button
          onClick={handleSignAndPay}
          disabled={loading}
          className="w-full bg-orange-600 hover:bg-orange-500 transition text-white font-semibold p-3 rounded text-sm tracking-wide uppercase"
        >
          {loading ? status : "Pay & Unlock Instantly"}
        </button>
      </div>
    </div>
  );
}