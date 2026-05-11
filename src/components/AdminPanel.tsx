import React, { useState, useEffect } from 'react';
import { Users, FileText, Trash2, ShieldCheck, ShieldAlert, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface Employee {
  employee_id: string;
  full_name: string;
  role: 'admin' | 'employee';
  is_active: boolean;
  created_at: string;
}

export default function AdminPanel() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmp, setNewEmp] = useState({ employeeId: '', fullName: '', role: 'employee' as 'admin' | 'employee' });

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees', {
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('nexus_token')}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) setEmployees(data);
    } catch (err) {
      toast.error('Failed to fetch employees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleToggleActive = async (empId: string, currentStatus: boolean) => {
    try {
      await fetch(`/api/employees/${empId}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('nexus_token')}` 
        },
        body: JSON.stringify({ isActive: !currentStatus })
      });
      fetchEmployees();
      toast.success(`Account ${!currentStatus ? 'activated' : 'deactivated'}`);
    } catch (err) {
      toast.error('Operation failed');
    }
  };

  const handleDelete = async (empId: string) => {
    if (!confirm('Permanently delete this employee account? This will orphan their conversations.')) return;
    try {
      await fetch(`/api/employees/${empId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('nexus_token')}` }
      });
      fetchEmployees();
      toast.success('Employee record purged');
    } catch (err) {
      toast.error('Deletion failed');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('nexus_token')}` 
        },
        body: JSON.stringify(newEmp)
      });
      if (res.ok) {
        fetchEmployees();
        setShowAddForm(false);
        setNewEmp({ employeeId: '', fullName: '', role: 'employee' });
        toast.success('Employee credential established');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to create');
      }
    } catch (err) {
      toast.error('Network error');
    }
  };

  return (
    <div className="p-8 h-full overflow-y-auto bg-black animate-in fade-in duration-500">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Header */}
        <div className="flex items-end justify-between border-b border-zinc-900 pb-10">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight text-white">Central Intelligence Governance</h1>
            <p className="text-zinc-500 text-sm max-w-xl leading-relaxed">
              Management of institutional roles, security credentials, and data accessibility protocols. 
              Only Administrators have authority to modify core neural nodes.
            </p>
          </div>
          <button 
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-3 rounded flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)]"
          >
            <Plus size={14} /> INITIALIZE AGENT
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-xl">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 rounded-lg"><Users className="text-blue-500" size={24} /></div>
              <div>
                <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold">Total Personnel</p>
                <p className="text-3xl font-mono text-white">{employees.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-xl">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-lg"><ShieldCheck className="text-green-500" size={24} /></div>
              <div>
                <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold">Active Sessions</p>
                <p className="text-3xl font-mono text-white">{employees.filter(e => e.is_active).length}</p>
              </div>
            </div>
          </div>
          <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-xl">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-500/10 rounded-lg"><ShieldAlert className="text-red-500" size={24} /></div>
              <div>
                <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold">Revoked Access</p>
                <p className="text-3xl font-mono text-white">{employees.filter(e => !e.is_active).length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Employee Table */}
        <div className="bg-zinc-950 border border-zinc-900 rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-900 bg-zinc-900/20">
                <th className="p-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Employee ID</th>
                <th className="p-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Full Identity</th>
                <th className="p-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Node Role</th>
                <th className="p-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Status</th>
                <th className="p-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-right">Operational Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.employee_id} className="border-b border-zinc-900 hover:bg-zinc-900/10 transition-colors group">
                  <td className="p-4">
                    <span className="font-mono text-xs text-blue-400">{emp.employee_id}</span>
                  </td>
                  <td className="p-4">
                    <span className="text-sm font-medium text-white">{emp.full_name}</span>
                  </td>
                  <td className="p-4 text-xs">
                    <span className={`px-2 py-1 rounded border uppercase text-[9px] font-bold ${
                      emp.role === 'admin' ? 'border-red-500/30 text-red-500 bg-red-500/5' : 'border-zinc-700 text-zinc-500 bg-zinc-900'
                    }`}>
                      {emp.role}
                    </span>
                  </td>
                  <td className="p-4 text-xs">
                    <span className={`flex items-center gap-2 ${emp.is_active ? 'text-green-500' : 'text-zinc-600'}`}>
                      <div className={`h-1.5 w-1.5 rounded-full ${emp.is_active ? 'bg-green-500' : 'bg-zinc-800'}`} />
                      {emp.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button 
                      onClick={() => handleToggleActive(emp.employee_id, emp.is_active)}
                      className={`p-2 rounded border transition-all ${
                        emp.is_active 
                        ? 'border-zinc-800 text-zinc-600 hover:border-red-500/50 hover:text-red-500' 
                        : 'border-zinc-800 text-zinc-600 hover:border-green-500/50 hover:text-green-500'
                      }`}
                      title={emp.is_active ? 'Revoke Access' : 'Restore Access'}
                    >
                      <ShieldCheck size={16} />
                    </button>
                    <button 
                      onClick={() => handleDelete(emp.employee_id)}
                      className="p-2 rounded border border-zinc-800 text-zinc-600 hover:border-red-600 hover:text-red-600 transition-all opacity-0 group-hover:opacity-100"
                      title="Purge Identity"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="p-12 text-center text-zinc-500 font-mono text-xs animate-pulse">SYNCHRONIZING PERSONNEL DATA...</div>}
          {!loading && employees.length === 0 && <div className="p-12 text-center text-zinc-700 font-mono text-xs">NO PERSONNEL RECORDS FOUND</div>}
        </div>
      </div>

      {/* Add Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-zinc-950 border border-zinc-900 w-full max-w-sm rounded-xl overflow-hidden shadow-2xl"
          >
            <div className="p-4 border-b border-zinc-900 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Initialize New Agent</p>
              <button onClick={() => setShowAddForm(false)} className="text-zinc-600 hover:text-white"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] text-zinc-600 uppercase font-bold">Unique Employee ID</label>
                <input 
                  required
                  placeholder="e.g. EMP042"
                  value={newEmp.employeeId}
                  onChange={e => setNewEmp({...newEmp, employeeId: e.target.value.toUpperCase()})}
                  className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-blue-600 focus:outline-none placeholder:text-zinc-800 font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-zinc-600 uppercase font-bold">Full Identity Name</label>
                <input 
                  required
                  placeholder="e.g. John Doe"
                  value={newEmp.fullName}
                  onChange={e => setNewEmp({...newEmp, fullName: e.target.value})}
                  className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-zinc-600 uppercase font-bold">Access Privilege Tier</label>
                <select 
                  value={newEmp.role}
                  onChange={e => setNewEmp({...newEmp, role: e.target.value as any})}
                  className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-blue-600 focus:outline-none"
                >
                  <option value="employee">Standard Employee</option>
                  <option value="admin">System Administrator</option>
                </select>
              </div>
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-3 mt-4 rounded transition-all">
                CONFIRM AUTHORIZATION
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
