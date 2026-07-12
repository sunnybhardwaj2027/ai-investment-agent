import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// FIX: Use environment variable for backend URL so it works locally AND live
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const socket = io(BACKEND_URL);

function App() {
  const [company, setCompany] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  
  // FIX: Using an array to track multiple statuses step-by-step
  const [statuses, setStatuses] = useState([]);

  useEffect(() => {
    // Append new status messages to the list
    socket.on('agent_status', (data) => {
      setStatuses((prev) => [...prev, data.message]);
    });
    
    socket.on('research_complete', (data) => {
      setResult(data);
      setLoading(false);
    });

    return () => {
      socket.off('agent_status');
      socket.off('research_complete');
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!company) return;
    
    setLoading(true);
    setResult(null);
    setStatuses([]); // Clear previous statuses
    
    socket.emit('start_research', company);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-10">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">AI Investment Analyst 📈</h1>
        <p className="text-slate-500 mb-8">Enter a company name to generate an Invest or Pass decision based on real-time market data.</p>
        
        <form onSubmit={handleSubmit} className="flex gap-3 mb-8">
          <input 
            className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g., AAPL, nvidia..."
          />
          <button 
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition disabled:bg-blue-400"
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </form>

        {/* AGENT THOUGHT PROCESS LIST */}
        {(statuses.length > 0) && (
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 mb-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Agent Thought Process</h3>
            <div className="space-y-3">
              {statuses.map((status, index) => (
                <div key={index} className="flex items-center text-slate-700">
                  <span className="mr-3 animate-pulse">⏳</span> {status}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FINAL VERDICT & CHART */}
        {result && !loading && (
          <div className={`p-6 rounded-2xl border ${result.verdict === 'INVEST' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <h2 className={`text-2xl font-bold mb-3 ${result.verdict === 'INVEST' ? 'text-green-700' : 'text-red-700'}`}>
              Verdict: {result.verdict} {result.verdict === 'INVEST' ? '✅' : '🛑'}
            </h2>
            <p className="text-slate-800 leading-relaxed mb-6"><strong className="font-semibold">Rationale:</strong> {result.rationale}</p>
            
            {result.historicalData && result.historicalData.length > 0 && (
              <div className="h-64 w-full bg-white p-4 rounded-xl border border-slate-200 shadow-sm mt-6">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">30-Day Price Trend</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.historicalData}>
                    <XAxis dataKey="date" hide />
                    <YAxis domain={['auto', 'auto']} hide />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Line type="monotone" dataKey="price" stroke={result.verdict === 'INVEST' ? '#16a34a' : '#dc2626'} strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;