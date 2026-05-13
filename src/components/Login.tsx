import { useState } from 'react';
import { SESSION_TOKEN_KEY, SESSION_EMPLOYEE_KEY } from '@/lib/constants';

interface LoginProps {
  onLogin: (employee: { id: string; name: string; role: string }) => void;
}

export const Login = ({ onLogin }: LoginProps) => {
  const [employeeId, setEmployeeId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!employeeId.trim()) return;
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: employeeId.trim() })
      });

      const text = await response.text();
      console.log('Raw login response:', text);

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error('Server returned invalid JSON: ' + text);
      }

      console.log('Parsed login data:', data);
      console.log('Token value:', data.token);
      console.log('Token type:', typeof data.token);

      if (!data.success || !data.token) {
        throw new Error(data.error || 'Login failed — no token received');
      }

      // Store token
      sessionStorage.setItem(SESSION_TOKEN_KEY, data.token);
      sessionStorage.setItem(SESSION_EMPLOYEE_KEY, JSON.stringify(data.employee));

      // Verify storage worked
      const storedToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
      console.log('Stored token verification:', storedToken);

      if (!storedToken || storedToken === 'undefined') {
        throw new Error('Failed to store session token');
      }

      onLogin(data.employee);

    } catch (err: any) {
      console.error('Login failed:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-80 space-y-6">
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <div className="w-1 h-6 bg-blue-600" />
            <span className="text-white font-bold tracking-wider text-lg">VAULTIC</span>
          </div>
          <p className="text-zinc-500 text-xs tracking-widest">INSTITUTIONAL MEMORY ENGINE</p>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-6 space-y-4">
          <div className="space-y-1">
            <p className="text-zinc-400 text-xs tracking-widest uppercase">Employee Authentication</p>
            <p className="text-zinc-600 text-xs">Enter your Employee ID to access the vault</p>
          </div>

          <input
            type="text"
            placeholder="Employee ID (e.g. ADMIN001)"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-white text-sm placeholder:text-zinc-600 focus:border-blue-600 focus:outline-none"
            autoFocus
          />

          <button
            onClick={handleLogin}
            disabled={loading || !employeeId.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm py-2 rounded transition-colors"
          >
            {loading ? 'Authenticating...' : 'Access Vault'}
          </button>

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}
        </div>

        <p className="text-zinc-700 text-xs text-center">
          Contact your administrator to get access
        </p>
      </div>
    </div>
  );
};
