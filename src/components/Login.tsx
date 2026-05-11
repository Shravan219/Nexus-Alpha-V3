import React, { useState } from 'react';

interface LoginProps {
  onLogin: (token: string, employee: any) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId })
      });

      const data = await res.json();

      if (data.success) {
        onLogin(data.token, data.employee);
      } else {
        setError(data.error || 'Invalid Employee ID or account inactive');
      }
    } catch (err) {
      setError('Connection refused. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center font-sans">
      <div className="w-80 space-y-6">
        {/* Logo */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <div className="w-1 h-6 bg-blue-600" />
            <span className="text-white font-bold tracking-wider text-xl">NEXUS ALPHA</span>
          </div>
          <p className="text-zinc-500 text-[10px] tracking-[0.3em] font-mono">INSTITUTIONAL MEMORY ENGINE</p>
        </div>

        {/* Login card */}
        <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-6 space-y-4 shadow-2xl">
          <div className="space-y-1">
            <p className="text-zinc-400 text-[10px] tracking-widest uppercase font-bold">Employee Authentication</p>
            <p className="text-zinc-600 text-[10px]">Enter your unique Employee ID for vault verification</p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
              placeholder="Employee ID (e.g. EMP001)"
              className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-white text-sm placeholder:text-zinc-700 focus:border-blue-600 focus:outline-none transition-colors font-mono"
              autoFocus
            />
            <button 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-bold py-2.5 rounded transition-all flex items-center justify-center gap-2"
            >
              {loading ? 'VERIFYING...' : 'ACCESS VAULT'}
            </button>
          </form>

          {error && (
            <p className="text-red-500 text-[10px] text-center bg-red-500/5 py-2 border border-red-500/10 rounded font-mono">
              {error}
            </p>
          )}
        </div>

        <p className="text-zinc-700 text-[10px] text-center uppercase tracking-tighter">
          Nexus Neural Core v2.5.0-STABLE
          <br />
          Contact Intelligence Oversight for Access
        </p>
      </div>
    </div>
  );
}
