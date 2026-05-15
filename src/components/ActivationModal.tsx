import React, { useState } from 'react';

// Step 2 Configurations
const DEVELOPER_WALLET = "0x2F514481c24e1Aafacc8226f34201cE356eD9EF5"; 
const TEST_PRICE_HEX = "0x2386F26FC10000"; // 0.01 POL for testing

export default function ActivationModal() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

const handleSignAndPay = async (companyLicenseKey: string) => {
  if (typeof window !== 'undefined' && !window.ethereum) {
    alert("Please install MetaMask.");
    return;
  }

  try {
    setLoading(true);
    setStatus("Connecting wallet...");

    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const userWallet = accounts[0];

    // 1. Legal Contract Signature
    setStatus("Awaiting signature...");
    const agreementText = `BY SIGNING, YOU ACTIVATING THE LICENSE KEY: ${companyLicenseKey}.`;
    await window.ethereum.request({
      method: 'personal_sign',
      params: [agreementText, userWallet],
    });

    // 2. Mainnet / Testnet Payment Transmission
    setStatus("Processing payment...");
    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{
        from: userWallet,
        to: DEVELOPER_WALLET,
        value: TEST_PRICE_HEX,
      }],
    });

    // Alert the user to give you the TxHash and their License Key
    alert(`Success! Copy this TxHash: ${txHash}`);
    
  } catch (error) {
    console.error(error);
    setStatus("Transaction failed.");
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 text-white font-sans">
      <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-xl max-w-md w-full text-center space-y-6">
        <h2 className="text-xl font-bold tracking-tight">Vaultic Activation Required</h2>
        <p className="text-sm text-zinc-400">
          To unlock your enterprise workspace, you must cryptographically sign the license contract and process the workspace activation payment.
        </p>
        
        <button
          onClick={handleSignAndPay}
          disabled={loading}
          className="w-full bg-orange-600 hover:bg-orange-500 transition text-white font-semibold p-3 rounded text-sm tracking-wide uppercase"
        >
          {loading ? status : "Connect MetaMask & Pay"}
        </button>
      </div>
    </div>
  );
}