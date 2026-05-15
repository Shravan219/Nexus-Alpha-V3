import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';

const DEVELOPER_WALLET = "0x2F5146bBC23a07EEB3149A5E12E94396000D9EF5"; 
const TEST_PRICE_HEX = "0x2386F26FC10000"; // 0.01 POL

interface ActivationModalProps {
  licenseKey: string;
  onPaymentComplete: () => void;
}

export default function ActivationModal({ licenseKey, onPaymentComplete }: ActivationModalProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const handlePaymentFlow = async () => {
    if (typeof window !== 'undefined' && !window.ethereum) {
      alert("MetaMask is required.");
      return;
    }

    try {
      setLoading(true);
      setStatus("Awaiting Connection...");

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const userWallet = accounts[0];

      setStatus("Signing Terms...");
      const agreementText = `UNLOCKING SYSTEM ACCESS FOR KEY: ${licenseKey}`;
      await window.ethereum.request({
        method: 'personal_sign',
        params: [agreementText, userWallet],
      });

      setStatus("Sending Payment...");
      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{ from: userWallet, to: DEVELOPER_WALLET, value: TEST_PRICE_HEX }],
      });

      setStatus("Flipping Database Switches...");

      // 🤖 AUTOMATIC DATABASE TRIGGER
      const { error } = await supabase
        .from('licenses')
        .update({
          is_active: true,            // Automatically sets cell to TRUE
          transaction_hash: txHash,   // Saves the transaction hash
          payment_received_at: new Date().toISOString()
        })
        .eq('license_key', licenseKey);

      if (error) throw error;

      setStatus("Unlocked!");
      
      // 🟢 This instantly fires the screen swap to the Login Screen
      onPaymentComplete();

    } catch (err) {
      console.error(err);
      setStatus("Payment failed or aborted.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 text-white font-mono">
      <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-lg max-w-sm w-full text-center space-y-6">
        <h1 className="text-xl font-bold tracking-widest text-orange-500">GATEWAY LOCKED</h1>
        <p className="text-xs text-zinc-400">License verification required to initialize authorization protocols.</p>
        <button
          onClick={handlePaymentFlow}
          disabled={loading}
          className="w-full bg-orange-600 hover:bg-orange-500 p-3 text-xs uppercase tracking-widest font-bold rounded text-white"
        >
          {loading ? status : "Process Activation"}
        </button>
      </div>
    </div>
  );
}