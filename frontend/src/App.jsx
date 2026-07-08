import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

// Connect to our Node.js backend running on port 3001
const socket = io('http://localhost:3001');

function App() {
  const [companyName, setCompanyName] = useState('');
  const [statusMessages, setStatusMessages] = useState([]);
  const [isResearching, setIsResearching] = useState(false);
  const [finalResult, setFinalResult] = useState(null);

  useEffect(() => {
    // Listen for real-time progress updates from the backend agent
    socket.on('agent_status', (data) => {
      setStatusMessages((prev) => [...prev, data.message]);
    });

    // Listen for the final analysis verdict
    socket.on('research_complete', (data) => {
      setFinalResult(data);
      setIsResearching(false); // Turn off the loading state
    });

    // Cleanup listeners when component unmounts
    return () => {
      socket.off('agent_status');
      socket.off('research_complete');
    };
  }, []);

  const startResearch = (e) => {
    e.preventDefault();
    if (!companyName.trim()) return;

    // Reset state for a new search
    setStatusMessages([]);
    setFinalResult(null);
    setIsResearching(true);

    // Tell the backend to start the LangGraph agent
    socket.emit('start_research', companyName);
  };

  return (
    <div style={{ 
      fontFamily: 'system-ui, -apple-system, sans-serif', 
      maxWidth: '700px', 
      margin: '40px auto', 
      padding: '30px',
      backgroundColor: '#ffffff',
      borderRadius: '16px',
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.05)',
      color: '#1a1a1a'
    }}>
      <h1 style={{ fontSize: '28px', marginBottom: '8px', color: '#111827' }}>
        AI Investment Analyst 📈
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '24px' }}>
        Enter a company name to generate an Invest or Pass decision based on real-time market data.
      </p>

      <form onSubmit={startResearch} style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
        <input 
          type="text" 
          placeholder="e.g. Tesla, Apple, Nvidia" 
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          disabled={isResearching}
          style={{ 
            flex: 1, 
            padding: '14px 16px', 
            fontSize: '16px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
        />
        <button 
          type="submit" 
          disabled={isResearching}
          style={{ 
            padding: '14px 28px', 
            fontSize: '16px', 
            fontWeight: '600',
            cursor: isResearching ? 'not-allowed' : 'pointer',
            backgroundColor: isResearching ? '#9ca3af' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            transition: 'background-color 0.2s'
          }}
        >
          {isResearching ? 'Analyzing...' : 'Analyze'}
        </button>
      </form>

      {}
      {statusMessages.length > 0 && (
        <div style={{ 
          background: '#f9fafb', 
          border: '1px solid #f3f4f6',
          padding: '20px', 
          borderRadius: '12px', 
          marginBottom: '24px' 
        }}>
          <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4b5563', marginTop: 0, marginBottom: '16px' }}>
            Agent Thought Process
          </h3>
          <ul style={{ listStyleType: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {statusMessages.map((msg, idx) => (
              <li key={idx} style={{ color: '#374151', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px' }}>⏳</span> {msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      {}
      {finalResult && (
        <div style={{ 
          background: finalResult.verdict === 'INVEST' ? '#f0fdf4' : '#fef2f2', 
          border: `2px solid ${finalResult.verdict === 'INVEST' ? '#22c55e' : '#ef4444'}`,
          padding: '24px', 
          borderRadius: '12px',
          animation: 'fadeIn 0.5s ease-in-out'
        }}>
          <h2 style={{ 
            marginTop: 0, 
            marginBottom: '12px',
            color: finalResult.verdict === 'INVEST' ? '#166534' : '#991b1b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            Verdict: {finalResult.verdict} {finalResult.verdict === 'INVEST' ? '🚀' : '🛑'}
          </h2>
          <p style={{ margin: 0, color: '#374151', lineHeight: '1.6' }}>
            <strong>Rationale:</strong> {finalResult.rationale}
          </p>
        </div>
      )}
    </div>
  );
}

export default App;