import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const POPULAR_STOCKS = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'AMD'];

function App() {
  const [company, setCompany] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(BACKEND_URL, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    socketRef.current = socket;

    socket.on('agent_status', (data) => {
      setStatuses((prev) => [...prev, data.message || data]);
    });

    socket.on('research_complete', (data) => {
      setResult(data);
      setLoading(false);
      setErrorMsg(null);
    });

    socket.on('research_error', (err) => {
      setErrorMsg(err.message || 'An error occurred during analysis.');
      setLoading(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleSearch = async (queryToSearch) => {
    const target = queryToSearch || company;
    if (!target.trim() || loading) return;

    setCompany(target.trim());
    setLoading(true);
    setResult(null);
    setErrorMsg(null);
    setStatuses([]);

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('start_research', target.trim());
    } else {
      // REST API fallback
      try {
        setStatuses(['Connecting to server...', 'Fetching market data and news...']);
        const res = await fetch(`${BACKEND_URL}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company: target.trim() })
        });
        const data = await res.json();
        if (data.error) {
          setErrorMsg(data.error);
        } else {
          setResult(data);
        }
      } catch (err) {
        setErrorMsg('Could not connect to backend server. Make sure the backend is running.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSearch(company);
  };

  // Determine verdict color
  const isInvest = result?.verdict?.toUpperCase().includes('INVEST') || result?.verdict?.toUpperCase().includes('BUY');
  const isPass = result?.verdict?.toUpperCase().includes('PASS') || result?.verdict?.toUpperCase().includes('SELL');

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col justify-between font-sans">
      
      {/* Navigation Header */}
      <header className="border-b border-slate-800 bg-[#0e1322]/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20">
              📈
            </div>
            <div>
              <h1 className="text-lg font-bold text-white leading-none">AI Investment Agent</h1>
              <p className="text-xs text-slate-400 mt-0.5">Real-time market data & AI stock analysis</p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Live Market Intelligence</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto px-4 py-8 w-full flex-1">
        
        {/* Search Box & Popular Quick Chips */}
        <div className="card-surface rounded-2xl p-6 sm:p-8 shadow-xl mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
            Analyze Any Company or Ticker
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            Enter a company name or ticker to generate an Invest or Pass decision based on live stock metrics and recent news.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. NVDA, AAPL, Tesla, Microsoft, AMZN..."
              disabled={loading}
              className="flex-1 px-4 py-3.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
            <button
              type="submit"
              disabled={loading || !company.trim()}
              className="px-7 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm transition shadow-lg shadow-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>Analyzing...</span>
                </>
              ) : (
                <span>Analyze</span>
              )}
            </button>
          </form>

          {/* Quick Click Tickers */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="text-xs text-slate-400 font-medium">Quick Pick:</span>
            {POPULAR_STOCKS.map((ticker) => (
              <button
                key={ticker}
                type="button"
                onClick={() => handleSearch(ticker)}
                disabled={loading}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono transition cursor-pointer border border-slate-700/60"
              >
                {ticker}
              </button>
            ))}
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm mb-6 flex items-start gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <strong className="font-semibold block">Analysis Error</strong>
              <span>{errorMsg}</span>
            </div>
          </div>
        )}

        {/* Live Agent Thought Process */}
        {statuses.length > 0 && loading && (
          <div className="card-surface rounded-2xl p-5 shadow-lg mb-6 border border-slate-800 animate-fadeIn">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400 mb-3">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
              <span>Agent Thought Process</span>
            </div>
            <div className="space-y-2.5">
              {statuses.map((status, index) => (
                <div key={index} className="flex items-center gap-3 text-xs sm:text-sm text-slate-300">
                  <span className="text-blue-400 animate-pulse">⏳</span>
                  <span>{status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analysis Result Card */}
        {result && !loading && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Main Verdict Card */}
            <div className={`rounded-2xl p-6 sm:p-8 border shadow-xl ${
              isInvest 
                ? 'bg-emerald-950/20 border-emerald-500/30 shadow-emerald-950/20' 
                : isPass 
                  ? 'bg-rose-950/20 border-rose-500/30 shadow-rose-950/20' 
                  : 'bg-amber-950/20 border-amber-500/30'
            }`}>
              
              {/* Header: Name, Symbol, and Verdict Badge */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-6">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-2xl font-bold text-white">{result.name}</h3>
                    <span className="px-2.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs font-semibold">
                      {result.symbol}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{result.sector || 'Public Asset'}</p>
                </div>

                <div className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-lg font-bold shadow-md ${
                  isInvest 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                    : isPass 
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' 
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}>
                  <span>Verdict: {result.verdict}</span>
                  <span>{isInvest ? '✅' : (isPass ? '🛑' : '⏸️')}</span>
                </div>
              </div>

              {/* Real-time Key Financial Metrics Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 font-mono">
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-slate-400">Current Price</div>
                  <div className="text-lg font-bold text-white mt-1">
                    ${result.price !== undefined ? Number(result.price).toFixed(2) : 'N/A'}
                  </div>
                  {result.changePercent !== undefined && (
                    <div className={`text-[11px] font-semibold mt-0.5 ${result.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {result.changePercent >= 0 ? '+' : ''}{Number(result.changePercent).toFixed(2)}%
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-slate-400">Market Cap</div>
                  <div className="text-lg font-bold text-white mt-1">
                    {result.marketCapFormatted || 'N/A'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Valuation</div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-slate-400">P/E Ratio</div>
                  <div className="text-lg font-bold text-white mt-1">
                    {result.peRatio ? `${result.peRatio}x` : 'N/A'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Trailing 12M</div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-slate-400">52-Week Range</div>
                  <div className="text-xs font-bold text-white mt-1 truncate">
                    ${result.fiftyTwoWeekLow || 'N/A'} - ${result.fiftyTwoWeekHigh || 'N/A'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Low - High</div>
                </div>
              </div>

              {/* AI Rationale */}
              <div className="p-4 sm:p-5 rounded-xl bg-slate-900/80 border border-slate-800 mb-6">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                  <span>💡</span>
                  <span>AI Analyst Rationale</span>
                </h4>
                <p className="text-sm sm:text-base text-slate-200 leading-relaxed font-normal">
                  {result.rationale}
                </p>
              </div>

              {/* Key Drivers and Key Risks (Side-by-Side) */}
              {((result.keyDrivers && result.keyDrivers.length > 0) || (result.keyRisks && result.keyRisks.length > 0)) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {result.keyDrivers && result.keyDrivers.length > 0 && (
                    <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                      <h5 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <span>🚀</span>
                        <span>Key Growth Drivers</span>
                      </h5>
                      <ul className="space-y-2 text-xs text-slate-300">
                        {result.keyDrivers.map((driver, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-emerald-400 font-bold">•</span>
                            <span>{driver}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.keyRisks && result.keyRisks.length > 0 && (
                    <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                      <h5 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <span>⚠️</span>
                        <span>Key Risks to Watch</span>
                      </h5>
                      <ul className="space-y-2 text-xs text-slate-300">
                        {result.keyRisks.map((risk, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-rose-400 font-bold">•</span>
                            <span>{risk}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* 30-Day Real Historical Chart Card */}
            {result.historicalData && result.historicalData.length > 0 && (
              <div className="card-surface rounded-2xl p-5 sm:p-6 shadow-xl border border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-bold text-white">30-Day Real Price Trend</h4>
                    <p className="text-xs text-slate-400 font-mono">Historical daily closing prices</p>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    Latest: ${result.price ? Number(result.price).toFixed(2) : ''}
                  </span>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={result.historicalData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={isInvest ? '#10B981' : (isPass ? '#EF4444' : '#3B82F6')} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={isInvest ? '#10B981' : (isPass ? '#EF4444' : '#3B82F6')} stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.5} />
                      <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis domain={['auto', 'auto']} stroke="#64748b" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '12px',
                          color: '#f8fafc',
                          fontSize: '12px',
                          fontFamily: 'monospace'
                        }}
                        formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Close Price']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="price" 
                        stroke={isInvest ? '#10B981' : (isPass ? '#EF4444' : '#3B82F6')} 
                        strokeWidth={2.5} 
                        fill="url(#chartGradient)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

          </div>
        )}

      </main>

      {/* Clean Footer */}
      <footer className="border-t border-slate-800/80 py-5 text-center text-xs font-mono text-slate-500 bg-[#090d16]">
        AI Investment Agent • Powered by Live Market Quotes & AI Synthesis
      </footer>

    </div>
  );
}

export default App;