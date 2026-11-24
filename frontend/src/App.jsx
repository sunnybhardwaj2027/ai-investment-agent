import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const POPULAR_STOCKS = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'AMD'];
const RECENT_STORAGE_KEY = 'ai_investment_agent_recent';

const PIPELINE_STEPS = [
  { id: 1, label: 'Resolve Ticker Symbol' },
  { id: 2, label: 'Fetch Live Market Data' },
  { id: 3, label: 'Scan Financial News' },
  { id: 4, label: 'Synthesize AI Verdict' }
];

function formatCurrency(value, currency = 'USD') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatChartDate(dateStr) {
  if (!dateStr) return '';
  const parsed = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Source';
  }
}

function getRangeProgress(price, low, high) {
  if (
    typeof price !== 'number' ||
    typeof low !== 'number' ||
    typeof high !== 'number' ||
    high <= low
  ) {
    return null;
  }
  const pct = ((price - low) / (high - low)) * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

function loadRecentTickers() {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}

function App() {
  const [company, setCompany] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [recentTickers, setRecentTickers] = useState(loadRecentTickers);
  const socketRef = useRef(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const saveRecentTicker = (symbol) => {
    if (!symbol) return;
    setRecentTickers((prev) => {
      const next = [symbol, ...prev.filter((item) => item !== symbol)].slice(0, 5);
      try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  };

  useEffect(() => {
    const socket = io(BACKEND_URL, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
      if (loadingRef.current) {
        setErrorMsg('Lost connection to analysis server. Please try again.');
        setLoading(false);
      }
    });

    socket.on('connect_error', () => {
      setSocketConnected(false);
    });

    socket.on('agent_status', (data) => {
      const stepNum = typeof data?.step === 'number' ? data.step : 0;
      const msg = data?.message || String(data || '');
      if (stepNum > 0) setActiveStep(stepNum);
      if (msg) setStatusMessage(msg);
    });

    socket.on('research_complete', (data) => {
      setResult(data);
      saveRecentTicker(data?.symbol);
      setLoading(false);
      setActiveStep(0);
      setErrorMsg(null);
    });

    socket.on('research_error', (err) => {
      setErrorMsg(err?.message || 'An error occurred during analysis.');
      setLoading(false);
      setActiveStep(0);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleSearch = async (queryToSearch) => {
    const target = (queryToSearch ?? company).trim();
    if (!target || loading) return;

    setCompany(target);
    setLoading(true);
    setResult(null);
    setErrorMsg(null);
    setActiveStep(1);
    setStatusMessage(`Starting research pipeline for "${target}"...`);

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('start_research', target);
    } else {
      // REST API fallback when WebSocket is unavailable
      try {
        setActiveStep(2);
        setStatusMessage('Running analysis via REST API...');
        const res = await fetch(`${BACKEND_URL}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company: target })
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          setErrorMsg(data.error || 'Analysis failed.');
        } else {
          setResult(data);
          saveRecentTicker(data?.symbol);
        }
      } catch {
        setErrorMsg('Could not connect to backend server. Make sure the backend is running on port 3001.');
      } finally {
        setLoading(false);
        setActiveStep(0);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSearch(company);
  };

  const verdictUpper = result?.verdict?.toUpperCase() || '';
  const isInvest = verdictUpper.includes('INVEST') || verdictUpper.includes('BUY');
  const isPass = verdictUpper.includes('PASS') || verdictUpper.includes('SELL');

  const accentHex = isInvest ? '#10B981' : isPass ? '#F43F5E' : '#F59E0B';
  const rangeProgress = result
    ? getRangeProgress(result.price, result.fiftyTwoWeekLow, result.fiftyTwoWeekHigh)
    : null;

  return (
    <div className="min-h-dvh text-slate-100 flex flex-col justify-between font-sans">
      {/* Navigation Header */}
      <header className="border-b border-slate-800/80 bg-[#0b101d]/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/15">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white leading-none">
                AI Investment Agent
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Live market quotes, news sentiment &amp; AI synthesis
              </p>
            </div>
          </div>

          <div
            className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/70 text-slate-300"
            title={socketConnected ? 'Real-time WebSocket stream connected' : 'Using HTTP REST fallback'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                socketConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="hidden sm:inline">
              {socketConnected ? 'Live Stream Ready' : 'REST Fallback Mode'}
            </span>
            <span className="sm:hidden">{socketConnected ? 'Live' : 'REST'}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 w-full flex-1">
        {/* Search & Quick Picks */}
        <section aria-label="Stock Search" className="card-surface rounded-2xl p-6 sm:p-8 shadow-2xl mb-6">
          <div className="max-w-2xl">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-1.5">
              Analyze Any Public Company or Ticker
            </h2>
            <p className="text-sm text-slate-400 mb-5">
              Enter a company name (e.g. Oracle, Boeing, Reliance) or stock symbol to fetch live Yahoo Finance metrics, scan recent headlines, and generate an Invest, Hold, or Pass thesis.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <svg
                className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Search NVDA, AAPL, Oracle, Boeing, BTC-USD..."
                disabled={loading}
                aria-label="Company name or stock symbol"
                className="w-full pl-10 pr-9 py-3.5 rounded-xl bg-slate-950/70 border border-slate-700/80 text-white placeholder-slate-500 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500 transition"
              />
              {company && !loading && (
                <button
                  type="button"
                  onClick={() => setCompany('')}
                  aria-label="Clear search input"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center text-sm transition cursor-pointer"
                >
                  ×
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !company.trim()}
              className="px-7 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm transition shadow-lg shadow-blue-600/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <span>Analyze Stock</span>
              )}
            </button>
          </form>

          {/* Quick Pick & Recent Tickers */}
          <div className="flex flex-col gap-2.5 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 font-medium mr-1">Popular:</span>
              {POPULAR_STOCKS.map((ticker) => {
                const isSelected = result?.symbol === ticker;
                return (
                  <button
                    key={ticker}
                    type="button"
                    onClick={() => handleSearch(ticker)}
                    disabled={loading}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition cursor-pointer border focus-visible:outline-2 focus-visible:outline-blue-400 ${
                      isSelected
                        ? 'bg-blue-600/25 border-blue-500/60 text-blue-200'
                        : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border-slate-700/60'
                    }`}
                  >
                    {ticker}
                  </button>
                );
              })}
            </div>

            {recentTickers.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 font-medium mr-1">Recent:</span>
                {recentTickers.map((ticker) => (
                  <button
                    key={ticker}
                    type="button"
                    onClick={() => handleSearch(ticker)}
                    disabled={loading}
                    className="px-2.5 py-0.5 rounded-md bg-slate-900/70 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-mono transition cursor-pointer border border-slate-800"
                  >
                    {ticker}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Error Alert */}
        {errorMsg && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm mb-6 flex items-start gap-3 animate-fadeIn"
          >
            <span className="text-lg leading-none" aria-hidden="true">⚠️</span>
            <div>
              <strong className="font-semibold block text-rose-200">Analysis Error</strong>
              <span>{errorMsg}</span>
            </div>
          </div>
        )}

        {/* Live 4-Step Agent Pipeline Progress */}
        {loading && (
          <section
            aria-label="Agent Analysis Progress"
            className="card-surface rounded-2xl p-6 shadow-xl mb-6 animate-fadeIn"
          >
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                <span>Agent Pipeline Running</span>
              </div>
              <span className="text-xs font-mono text-slate-400">
                Step {Math.max(1, activeStep)} / {PIPELINE_STEPS.length}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 mb-4">
              {PIPELINE_STEPS.map((step) => {
                const isDone = activeStep > step.id;
                const isCurrent = activeStep === step.id;
                return (
                  <div
                    key={step.id}
                    className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 transition ${
                      isDone
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : isCurrent
                          ? 'bg-blue-500/15 border-blue-500/40 text-blue-200'
                          : 'bg-slate-900/50 border-slate-800 text-slate-500'
                    }`}
                  >
                    {isDone ? (
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold shrink-0">
                        ✓
                      </span>
                    ) : isCurrent ? (
                      <span className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin shrink-0" />
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center font-mono text-[11px] shrink-0">
                        {step.id}
                      </span>
                    )}
                    <span className="font-medium leading-tight">{step.label}</span>
                  </div>
                );
              })}
            </div>

            {statusMessage && (
              <p className="text-xs sm:text-sm font-mono text-slate-300 bg-slate-950/60 border border-slate-800/80 rounded-xl px-3.5 py-2.5">
                {statusMessage}
              </p>
            )}
          </section>
        )}

        {/* Analysis Result */}
        {result && !loading && (
          <div className="space-y-6 animate-fadeIn">
            {/* Main Verdict Article */}
            <article
              className={`rounded-2xl p-6 sm:p-8 border shadow-2xl ${
                isInvest
                  ? 'bg-emerald-950/20 border-emerald-500/30 shadow-emerald-950/20'
                  : isPass
                    ? 'bg-rose-950/20 border-rose-500/30 shadow-rose-950/20'
                    : 'bg-amber-950/20 border-amber-500/30 shadow-amber-950/20'
              }`}
            >
              {/* Header: Name, Symbol, Verdict & Confidence */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/90 pb-5 mb-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-2xl font-bold tracking-tight text-white">{result.name}</h3>
                    <span className="px-2.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-200 font-mono text-xs font-semibold">
                      {result.symbol}
                    </span>
                    {result.sector && (
                      <span className="px-2.5 py-0.5 rounded-md bg-slate-900/80 border border-slate-800 text-slate-400 text-xs">
                        {result.sector}
                      </span>
                    )}
                  </div>
                  {result.analyzedAt && (
                    <p className="text-xs text-slate-500 font-mono mt-1.5">
                      Analyzed {new Date(result.analyzedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {typeof result.confidence === 'number' && (
                    <div className="px-3.5 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className="text-slate-400">AI Confidence</span>
                        <span className="text-white font-bold tabular-nums">{result.confidence}%</span>
                      </div>
                      <div className="w-28 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            isInvest ? 'bg-emerald-400' : isPass ? 'bg-rose-400' : 'bg-amber-400'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, result.confidence))}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-base sm:text-lg font-bold shadow-md ${
                      isInvest
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : isPass
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    <span>Verdict: {result.verdict}</span>
                    <span aria-hidden="true">{isInvest ? '✅' : isPass ? '🛑' : '⏸️'}</span>
                  </div>
                </div>
              </div>

              {result.aiFallback && (
                <div className="mb-5 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs flex items-center gap-2">
                  <span aria-hidden="true">ℹ️</span>
                  <span>
                    Live Gemini synthesis was unavailable or unconfigured; showing heuristic fallback metrics and commentary.
                  </span>
                </div>
              )}

              {/* Real-time Key Financial Metrics Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 font-mono tabular-nums">
                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/90">
                  <div className="text-xs text-slate-400 font-sans">Current Price</div>
                  <div className="text-lg sm:text-xl font-bold text-white mt-1">
                    {formatCurrency(result.price, result.currency)}
                  </div>
                  {typeof result.changePercent === 'number' && (
                    <div
                      className={`text-xs font-semibold mt-1 ${
                        result.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {result.change >= 0 ? '+' : ''}
                      {typeof result.change === 'number' ? result.change.toFixed(2) : ''} (
                      {result.changePercent >= 0 ? '+' : ''}
                      {result.changePercent.toFixed(2)}% today)
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/90">
                  <div className="text-xs text-slate-400 font-sans">Market Cap</div>
                  <div className="text-lg sm:text-xl font-bold text-white mt-1">
                    {result.marketCapFormatted || 'N/A'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-sans">Total Valuation</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/90">
                  <div className="text-xs text-slate-400 font-sans">P/E Ratio</div>
                  <div className="text-lg sm:text-xl font-bold text-white mt-1">
                    {result.peRatio ? `${result.peRatio}x` : 'N/A'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-sans">Trailing 12M</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/90">
                  <div className="text-xs text-slate-400 font-sans">52-Week Range</div>
                  {typeof result.fiftyTwoWeekLow === 'number' && typeof result.fiftyTwoWeekHigh === 'number' ? (
                    <>
                      <div className="text-xs sm:text-sm font-bold text-white mt-1.5">
                        {formatCurrency(result.fiftyTwoWeekLow, result.currency)} –{' '}
                        {formatCurrency(result.fiftyTwoWeekHigh, result.currency)}
                      </div>
                      {rangeProgress !== null && (
                        <div className="mt-2">
                          <div className="w-full h-1.5 rounded-full bg-slate-800 relative">
                            <div
                              className="w-2.5 h-2.5 rounded-full bg-blue-400 ring-2 ring-slate-900 absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                              style={{ left: `${rangeProgress}%` }}
                              title={`Current price is at ${rangeProgress}% of 52-week range`}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="text-lg font-bold text-white mt-1">N/A</div>
                      <div className="text-xs text-slate-500 mt-1 font-sans">Range unavailable</div>
                    </>
                  )}
                </div>
              </div>

              {/* AI Rationale */}
              <div className="p-4 sm:p-5 rounded-xl bg-slate-900/80 border border-slate-800 mb-6">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                  <span aria-hidden="true">💡</span>
                  <span>AI Analyst Rationale</span>
                </h4>
                <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
                  {result.rationale}
                </p>
              </div>

              {/* Key Drivers and Key Risks */}
              {((result.keyDrivers && result.keyDrivers.length > 0) ||
                (result.keyRisks && result.keyRisks.length > 0)) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {result.keyDrivers && result.keyDrivers.length > 0 && (
                    <div className="p-4 sm:p-5 rounded-xl bg-slate-900/55 border border-slate-800">
                      <h5 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <span aria-hidden="true">🚀</span>
                        <span>Key Growth Drivers</span>
                      </h5>
                      <ul className="space-y-2.5 text-xs sm:text-sm text-slate-300">
                        {result.keyDrivers.map((driver, idx) => (
                          <li key={idx} className="flex items-start gap-2.5">
                            <span className="text-emerald-400 font-bold mt-0.5">•</span>
                            <span>{driver}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.keyRisks && result.keyRisks.length > 0 && (
                    <div className="p-4 sm:p-5 rounded-xl bg-slate-900/55 border border-slate-800">
                      <h5 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <span aria-hidden="true">⚠️</span>
                        <span>Key Risks to Watch</span>
                      </h5>
                      <ul className="space-y-2.5 text-xs sm:text-sm text-slate-300">
                        {result.keyRisks.map((risk, idx) => (
                          <li key={idx} className="flex items-start gap-2.5">
                            <span className="text-rose-400 font-bold mt-0.5">•</span>
                            <span>{risk}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </article>

            {/* 30-Day Real Historical Chart Card */}
            {result.historicalData && result.historicalData.length > 0 && (
              <section
                aria-label="30-Day Historical Price Chart"
                className="card-surface rounded-2xl p-5 sm:p-6 shadow-xl"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-white">30-Day Price Trend</h4>
                    <p className="text-xs text-slate-400 font-mono">
                      Daily closing prices ({result.historicalData.length} trading sessions)
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 font-mono text-xs tabular-nums">
                    {typeof result.thirtyDayChangePercent === 'number' && (
                      <span
                        className={`px-2.5 py-1 rounded-lg border font-semibold ${
                          result.thirtyDayChangePercent >= 0
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                        }`}
                      >
                        {result.thirtyDayChangePercent >= 0 ? '+' : ''}
                        {result.thirtyDayChangePercent.toFixed(2)}% (30D)
                      </span>
                    )}
                    <span className="text-slate-300">
                      Latest: {formatCurrency(result.price, result.currency)}
                    </span>
                  </div>
                </div>

                <div className="h-64 sm:h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={result.historicalData}
                      margin={{ top: 10, right: 12, left: 4, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={accentHex} stopOpacity={0.32} />
                          <stop offset="95%" stopColor={accentHex} stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.6} />
                      <XAxis
                        dataKey="date"
                        stroke="#64748b"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={28}
                        tickFormatter={formatChartDate}
                      />
                      <YAxis
                        domain={['auto', 'auto']}
                        stroke="#64748b"
                        width={64}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => formatCurrency(Number(v), result.currency)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '12px',
                          color: '#f8fafc',
                          fontSize: '12px',
                          fontFamily: 'var(--font-mono)'
                        }}
                        labelFormatter={formatChartDate}
                        formatter={(value) => [
                          formatCurrency(Number(value), result.currency),
                          'Close'
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="price"
                        stroke={accentHex}
                        strokeWidth={2.5}
                        fill="url(#chartGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {/* Recent Financial News Sources */}
            {result.news && result.news.length > 0 && (
              <section
                aria-label="Recent Financial News"
                className="card-surface rounded-2xl p-5 sm:p-6 shadow-xl"
              >
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-white">
                      Scanned Market News &amp; Sources
                    </h4>
                    <p className="text-xs text-slate-400">
                      Live headlines retrieved via Tavily Search and factored into the AI verdict
                    </p>
                  </div>
                  <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-300">
                    {result.news.length} {result.news.length === 1 ? 'article' : 'articles'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {result.news.map((item, idx) => (
                    <a
                      key={idx}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block rounded-xl p-4 bg-slate-900/65 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 transition focus-visible:outline-2 focus-visible:outline-blue-400"
                    >
                      <article>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-[11px] font-mono text-blue-400">
                            {getHostname(item.url)}
                          </span>
                          <span className="text-xs text-slate-500 group-hover:text-slate-300 transition">
                            ↗
                          </span>
                        </div>
                        <h5 className="text-sm font-semibold text-white group-hover:text-blue-300 transition line-clamp-2 mb-1.5">
                          {item.title}
                        </h5>
                        {item.content && (
                          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                            {item.content}
                          </p>
                        )}
                      </article>
                    </a>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-slate-800/80 py-5 px-4 text-center text-xs font-mono text-slate-500 bg-[#060911]">
        AI Investment Agent • Real-Time Yahoo Finance Data, Tavily News &amp; Gemini Analysis (Not Financial Advice)
      </footer>
    </div>
  );
}

export default App;