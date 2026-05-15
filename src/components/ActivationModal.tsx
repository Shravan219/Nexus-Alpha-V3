import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';

const DEVELOPER_WALLET = "0x2F5146bBC23a07EEB3149A5E12E94396000D9EF5"; 
const TEST_PRICE_HEX = "0x2386F26FC10000"; // 0.01 POL

interface ActivationModalProps {
  licenseKey: string;
  onSuccess: () => void; // Instantly drops the layout wall on completion
}

export default function ActivationModal({ licenseKey, onSuccess }: ActivationModalProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const handlePaymentAndAutoUnlock = async () => {
    if (typeof window !== 'undefined' && !window.ethereum) {
      alert("Please install MetaMask.");
      return;
    }

    try {
      setLoading(true);
      setStatus("Connecting wallet...");

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const userWallet = accounts[0];

      setStatus("Awaiting signature...");
      const agreementText = `BY SIGNING, YOU AUTOMATICALLY ACTIVATE LICENSE: ${licenseKey}`;
      await window.ethereum.request({
        method: 'personal_sign',
        params: [agreementText, userWallet],
      });

      setStatus("Processing transaction...");
      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: userWallet,
          to: DEVELOPER_WALLET,
          value: TEST_PRICE_HEX,
        }],
      });

      setStatus("Syncing with ledger...");

      // 🤖 THE AUTOMATION: Pushes hash to licenses table, changing state immediately
      const { error } = await supabase
        .from('licenses')
        .update({
          transaction_hash: txHash,
          payment_received_at: new Date().toISOString()
        })
        .eq('license_key', licenseKey);

      if (error) throw error;

      setStatus("Success!");
      // Force the parent container to clear the screen lock overlay right now
      onSuccess();

    } catch (err) {
      console.error(err);
      setStatus("Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 z-50 text-white">
      <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-xl max-w-md w-full text-center space-y-6">
        <h2 className="text-xl font-bold font-mono tracking-tight text-orange-500">WORKSPACE SECURED</h2>
        <p className="text-sm text-zinc-400">
          License Key <code className="bg-zinc-950 px-2 py-1 rounded text-zinc-300 font-mono text-xs">{licenseKey}</code> requires validation.
        </p>
        <button
          onClick={handlePaymentAndAutoUnlock}
          disabled={loading}
          className="w-full bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-800 transition font-mono p-3 rounded text-sm uppercase tracking-wider font-bold"
        >
          {loading ? status : "Verify & Unlock Dashboard"}
        </button>
      </div>
    </div>
  );
}