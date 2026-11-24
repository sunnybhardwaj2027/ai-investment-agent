import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { pathToFileURL } from 'url';
import YahooFinance from 'yahoo-finance2';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { TavilySearch } from "@langchain/tavily";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

dotenv.config();

// Opt-in TLS bypass only for explicit self-signed corporate proxy environments
if (process.env.ALLOW_INSECURE_TLS === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// Initialize YahooFinance client
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const app = express();
const PORT = Number(process.env.PORT || process.env.port) || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Lazy-initialized external AI & Search clients so missing keys fail gracefully
let cachedLlm = null;
function getLlmClient() {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!cachedLlm) {
    cachedLlm = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      temperature: 0.2,
      apiKey: process.env.GEMINI_API_KEY
    });
  }
  return cachedLlm;
}

let cachedSearchTool = null;
function getSearchTool() {
  if (!process.env.TAVILY_API_KEY) return null;
  if (!cachedSearchTool) {
    cachedSearchTool = new TavilySearch({
      maxResults: 4,
    });
  }
  return cachedSearchTool;
}

// Dictionary of common company names & aliases to stock tickers
export const COMMON_TICKERS = {
  "NVIDIA": "NVDA", "NVDA": "NVDA",
  "APPLE": "AAPL", "AAPL": "AAPL",
  "TESLA": "TSLA", "TSLA": "TSLA",
  "MICROSOFT": "MSFT", "MSFT": "MSFT",
  "AMAZON": "AMZN", "AMZN": "AMZN",
  "GOOGLE": "GOOGL", "ALPHABET": "GOOGL", "GOOGL": "GOOGL", "GOOG": "GOOG",
  "META": "META", "FACEBOOK": "META",
  "AMD": "AMD",
  "PALANTIR": "PLTR", "PLTR": "PLTR",
  "NETFLIX": "NFLX", "NFLX": "NFLX",
  "BITCOIN": "BTC-USD", "BTC": "BTC-USD", "BTC-USD": "BTC-USD",
  "ETHEREUM": "ETH-USD", "ETH": "ETH-USD", "ETH-USD": "ETH-USD",
  "COINBASE": "COIN", "COIN": "COIN",
  "SPOTIFY": "SPOT", "SPOT": "SPOT",
  "UBER": "UBER", "AIRBNB": "ABNB", "ABNB": "ABNB",
  "DISNEY": "DIS", "DIS": "DIS",
  "WALMART": "WMT", "WMT": "WMT",
  "COSTCO": "COST", "COST": "COST",
  "COCA COLA": "KO", "COCA-COLA": "KO", "KO": "KO",
  "PEPSI": "PEP", "PEPSICO": "PEP", "PEP": "PEP",
  "INTEL": "INTC", "INTC": "INTC",
  "ORACLE": "ORCL", "ORCL": "ORCL",
  "BOEING": "BA", "BA": "BA",
  "PFIZER": "PFE", "PFE": "PFE",
  "PAYPAL": "PYPL", "PYPL": "PYPL",
  "NIKE": "NKE", "NKE": "NKE",
  "FORD": "F",
  "SONY": "SONY",
  "ZOOM": "ZM", "ZM": "ZM",
  "ADOBE": "ADBE", "ADBE": "ADBE",
  "SALESFORCE": "CRM", "CRM": "CRM",
  "SHOPIFY": "SHOP", "SHOP": "SHOP",
  "QUALCOMM": "QCOM", "QCOM": "QCOM",
  "BROADCOM": "AVGO", "AVGO": "AVGO",
  "VISA": "V",
  "MASTERCARD": "MA",
  "JPMORGAN": "JPM", "JP MORGAN": "JPM", "JPM": "JPM",
  "GOLDMAN SACHS": "GS", "GS": "GS",
  "TARGET": "TGT", "TGT": "TGT",
  "RELIANCE": "RELIANCE.NS", "TCS": "TCS.NS", "INFOSYS": "INFY",
  "BERKSHIRE": "BRK-B", "BERKSHIRE HATHAWAY": "BRK-B", "BRK-B": "BRK-B",
  "SPDR S&P 500": "SPY", "SPY": "SPY", "S&P 500": "SPY",
  "NASDAQ": "QQQ", "QQQ": "QQQ"
};

const PREFERRED_QUOTE_TYPES = new Set(["EQUITY", "ETF", "CRYPTOCURRENCY", "INDEX", "MUTUALFUND"]);

/**
 * Format large market-cap values into human-readable strings (e.g. $3.45T).
 */
export function formatMarketCap(cap) {
  if (typeof cap !== 'number' || !Number.isFinite(cap) || cap <= 0) return 'N/A';
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(2)}M`;
  return `$${cap.toLocaleString('en-US')}`;
}

/**
 * Pick the best matching ticker symbol from Yahoo Finance search quotes.
 */
export function pickBestQuoteSymbol(quotes, cleanInput) {
  if (!Array.isArray(quotes) || quotes.length === 0) return null;

  const exactMatch = quotes.find(
    (q) => q?.symbol && q.symbol.toUpperCase() === cleanInput && PREFERRED_QUOTE_TYPES.has(q.quoteType)
  );
  if (exactMatch) return exactMatch.symbol;

  const preferredMatch = quotes.find(
    (q) => q?.symbol && PREFERRED_QUOTE_TYPES.has(q.quoteType)
  );
  if (preferredMatch) return preferredMatch.symbol;

  const anyMatch = quotes.find((q) => q?.symbol);
  return anyMatch ? anyMatch.symbol : null;
}

/**
 * Resolve a company name or ticker symbol into a valid market ticker.
 */
export async function resolveStockSymbol(input, deps = {}) {
  const fetchFn = deps.fetch || fetch;
  const yf = deps.yahooFinance || yahooFinance;

  const stripped = input.trim().replace(/^\$/, '');
  const clean = stripped.toUpperCase();

  if (COMMON_TICKERS[clean]) return COMMON_TICKERS[clean];

  // Explicit dotted/hyphenated ticker (e.g. RELIANCE.NS, BTC-USD, BRK-B)
  if (/^[A-Z0-9]{1,8}[.\-][A-Z]{1,4}$/.test(clean)) return clean;

  // Strategy 1: Direct Yahoo Finance search API (handles company names like "Oracle", "Boeing", and tickers)
  try {
    const res = await fetchFn(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(stripped)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
        }
      }
    );
    if (res.ok) {
      const data = await res.json();
      const matched = pickBestQuoteSymbol(data.quotes, clean);
      if (matched) return matched;
    }
  } catch (e) {
    console.warn("Direct search API error:", e.message);
  }

  // Strategy 2: yahoo-finance2 library search fallback
  try {
    const searchResults = await yf.search(stripped);
    const matched = pickBestQuoteSymbol(searchResults?.quotes, clean);
    if (matched) return matched;
  } catch (e) {
    console.warn("Library search error:", e.message);
  }

  // Final fallback for ticker-shaped inputs if search endpoints were unreachable
  if (/^[A-Z0-9.\-]{1,10}$/.test(clean)) return clean;
  return clean;
}

/**
 * Fetch live quote metrics and 30-day historical closing prices.
 */
export async function fetchMarketDataAndHistory(symbol, deps = {}) {
  const fetchFn = deps.fetch || fetch;
  const yf = deps.yahooFinance || yahooFinance;

  let quoteData = null;
  let history = [];

  // Strategy A: Direct Chart v8 API (resilient across cloud hosting IPs)
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
    const res = await fetchFn(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (res.ok) {
      const data = await res.json();
      const result = data.chart?.result?.[0];
      if (result && result.meta) {
        const meta = result.meta;
        const quoteObj = result.indicators?.quote?.[0];
        const timestamps = result.timestamp || [];
        const closes = quoteObj?.close || [];

        history = timestamps
          .map((ts, idx) => {
            const price = closes[idx];
            if (typeof price !== 'number' || !Number.isFinite(price)) return null;
            const d = new Date(ts * 1000);
            return {
              date: d.toISOString().split('T')[0],
              price: Number(price.toFixed(2))
            };
          })
          .filter(Boolean);

        const currentPrice =
          typeof meta.regularMarketPrice === 'number' && Number.isFinite(meta.regularMarketPrice)
            ? meta.regularMarketPrice
            : (history.length > 0 ? history[history.length - 1].price : 0);

        // Compute true daily change (not 30-day chartPreviousClose!)
        const dailyPrevClose =
          (typeof meta.regularMarketPreviousClose === 'number' && meta.regularMarketPreviousClose > 0
            ? meta.regularMarketPreviousClose
            : null) ??
          (typeof meta.previousClose === 'number' && meta.previousClose > 0
            ? meta.previousClose
            : null) ??
          (history.length >= 2 ? history[history.length - 2].price : currentPrice);

        const change = currentPrice - dailyPrevClose;
        const changePercent = dailyPrevClose ? (change / dailyPrevClose) * 100 : 0;

        // Compute 30-day trend separately
        const periodBase =
          (typeof meta.chartPreviousClose === 'number' && meta.chartPreviousClose > 0
            ? meta.chartPreviousClose
            : null) ?? (history.length > 0 ? history[0].price : currentPrice);
        const thirtyDayChangePercent = periodBase ? ((currentPrice - periodBase) / periodBase) * 100 : 0;

        quoteData = {
          symbol: meta.symbol || symbol,
          name: meta.shortName || meta.longName || meta.symbol || symbol,
          price: Number(currentPrice.toFixed(2)),
          change: Number(change.toFixed(2)),
          changePercent: Number(changePercent.toFixed(2)),
          thirtyDayChangePercent: Number(thirtyDayChangePercent.toFixed(2)),
          currency: meta.currency || 'USD',
          fiftyTwoWeekHigh: typeof meta.fiftyTwoWeekHigh === 'number' ? Number(meta.fiftyTwoWeekHigh.toFixed(2)) : null,
          fiftyTwoWeekLow: typeof meta.fiftyTwoWeekLow === 'number' ? Number(meta.fiftyTwoWeekLow.toFixed(2)) : null,
          marketCap: null,
          peRatio: null,
          sector: 'Public Asset'
        };
      }
    }
  } catch (err) {
    console.warn("Direct chart v8 fetch warning:", err.message);
  }

  // Strategy B: Enhance with detailed YahooFinance quote fields when available
  try {
    const q = await yf.quote(symbol);
    if (q) {
      const qPrice = typeof q.regularMarketPrice === 'number' ? Number(q.regularMarketPrice.toFixed(2)) : null;
      const qChange = typeof q.regularMarketChange === 'number' ? Number(q.regularMarketChange.toFixed(2)) : null;
      const qChangePct = typeof q.regularMarketChangePercent === 'number' ? Number(q.regularMarketChangePercent.toFixed(2)) : null;

      if (!quoteData) {
        quoteData = {
          symbol: q.symbol || symbol,
          name: q.shortName || q.longName || q.symbol || symbol,
          price: qPrice,
          change: qChange ?? 0,
          changePercent: qChangePct ?? 0,
          thirtyDayChangePercent: null,
          currency: q.currency || 'USD',
          fiftyTwoWeekHigh: typeof q.fiftyTwoWeekHigh === 'number' ? Number(q.fiftyTwoWeekHigh.toFixed(2)) : null,
          fiftyTwoWeekLow: typeof q.fiftyTwoWeekLow === 'number' ? Number(q.fiftyTwoWeekLow.toFixed(2)) : null,
          marketCap: q.marketCap || null,
          peRatio: typeof q.trailingPE === 'number' ? Number(q.trailingPE.toFixed(1)) : null,
          sector: q.sector || 'Public Asset'
        };
      } else {
        quoteData.name = q.shortName || q.longName || quoteData.name;
        if (qPrice !== null) quoteData.price = qPrice;
        if (qChange !== null) quoteData.change = qChange;
        if (qChangePct !== null) quoteData.changePercent = qChangePct;
        quoteData.currency = q.currency || quoteData.currency;
        quoteData.marketCap = q.marketCap || quoteData.marketCap;
        quoteData.peRatio = typeof q.trailingPE === 'number' ? Number(q.trailingPE.toFixed(1)) : quoteData.peRatio;
        quoteData.fiftyTwoWeekHigh = typeof q.fiftyTwoWeekHigh === 'number' ? Number(q.fiftyTwoWeekHigh.toFixed(2)) : quoteData.fiftyTwoWeekHigh;
        quoteData.fiftyTwoWeekLow = typeof q.fiftyTwoWeekLow === 'number' ? Number(q.fiftyTwoWeekLow.toFixed(2)) : quoteData.fiftyTwoWeekLow;
        quoteData.sector = q.sector || quoteData.sector;
      }
    }
  } catch (err) {
    console.warn("Yahoo quote extra fields warning:", err.message);
  }

  if (!quoteData || typeof quoteData.price !== 'number' || !Number.isFinite(quoteData.price) || quoteData.price <= 0) {
    throw new Error(`Could not find real market data for "${symbol}". Please check the symbol or company name.`);
  }

  return { quote: quoteData, historicalData: history };
}

/**
 * Normalize an AI verdict string to INVEST, PASS, or HOLD.
 */
export function normalizeVerdict(rawVerdict, fallbackVerdict = 'HOLD') {
  const upper = String(rawVerdict || '').trim().toUpperCase();
  if (upper.includes('INVEST') || upper.includes('BUY')) return 'INVEST';
  if (upper.includes('PASS') || upper.includes('SELL') || upper.includes('AVOID')) return 'PASS';
  if (upper.includes('HOLD')) return 'HOLD';
  return fallbackVerdict;
}

/**
 * Extract plain text from a LangChain message content field (string or content-part array).
 */
export function extractContentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('\n');
  }
  return String(content || '');
}

/**
 * Parse and validate the LLM JSON investment decision, falling back safely if malformed.
 */
export function parseAiDecision(rawContent, quote) {
  const fallbackVerdict = (quote?.thirtyDayChangePercent ?? quote?.changePercent ?? 0) >= 0 ? 'INVEST' : 'HOLD';
  const fallback = {
    verdict: fallbackVerdict,
    confidence: 65,
    rationale: `${quote.name} (${quote.symbol}) is trading at ${quote.price} ${quote.currency} (${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent}% today). Automated heuristic synthesis was used because live LLM output was unavailable.`,
    keyDrivers: [
      "Active market liquidity and real-time price discovery",
      quote.marketCap ? `Scale valuation of ${formatMarketCap(quote.marketCap)}` : "Established public market listing"
    ],
    keyRisks: [
      "Broad equity market and macroeconomic volatility",
      "AI synthesis fallback active — verify live fundamentals before acting"
    ],
    aiFallback: true
  };

  try {
    const text = extractContentText(rawContent)
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return fallback;
    }

    const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1));
    let confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence)) {
      confidence = 75;
    } else if (confidence > 0 && confidence <= 1) {
      confidence = Math.round(confidence * 100);
    } else {
      confidence = Math.round(Math.min(100, Math.max(0, confidence)));
    }

    const toCleanList = (arr, defaultArr) =>
      Array.isArray(arr)
        ? arr.map((item) => String(item).trim()).filter(Boolean).slice(0, 4)
        : defaultArr;

    const rationale = String(parsed.rationale || parsed.summary || '').trim();

    return {
      verdict: normalizeVerdict(parsed.verdict, fallbackVerdict),
      confidence,
      rationale: rationale || fallback.rationale,
      keyDrivers: toCleanList(parsed.keyDrivers, fallback.keyDrivers),
      keyRisks: toCleanList(parsed.keyRisks, fallback.keyRisks),
      aiFallback: false
    };
  } catch {
    return fallback;
  }
}

/**
 * Master Research Pipeline: resolves symbol, fetches real-time data, scans news, and generates AI verdict.
 */
export async function performResearch(companyInput, onProgress) {
  const notify = (step, message) => {
    if (onProgress) onProgress({ step, message });
  };

  // Step 1: Resolve Stock Symbol
  notify(1, `Resolving stock symbol for "${companyInput}"...`);
  const symbol = await resolveStockSymbol(companyInput);

  // Step 2: Fetch Live Real Market Data & Historical Chart
  notify(2, `Fetching real-time price & 30-day chart for ${symbol}...`);
  const { quote, historicalData } = await fetchMarketDataAndHistory(symbol);

  // Step 3: Fetch Recent News & Sentiment
  notify(3, `Scanning recent financial news and headlines for ${quote.name}...`);
  let newsText = 'No recent news found.';
  let newsArticles = [];

  const searchTool = getSearchTool();
  if (searchTool) {
    try {
      const query = `${quote.name || symbol} (${symbol}) stock financial news market sentiment`;
      const searchResults = await searchTool.invoke({ query });
      if (searchResults && Array.isArray(searchResults.results)) {
        newsArticles = searchResults.results
          .filter((r) => r && r.title && r.url)
          .map((r) => ({
            title: r.title,
            content: r.content || '',
            url: r.url
          }));
        if (newsArticles.length > 0) {
          newsText = newsArticles.map((r) => `- ${r.title}: ${r.content}`).join('\n');
        }
      } else if (typeof searchResults === 'string' && searchResults.trim()) {
        newsText = searchResults;
      }
    } catch (err) {
      console.warn("Tavily news search warning:", err.message);
      newsText = `${quote.name} is currently trading at ${quote.price} ${quote.currency}.`;
    }
  } else {
    console.warn("TAVILY_API_KEY not configured; skipping web news scan.");
    newsText = `${quote.name} is currently trading at ${quote.price} ${quote.currency}.`;
  }

  // Step 4: AI Investment Decision via Gemini
  notify(4, `Generating AI investment verdict & thesis for ${quote.name}...`);

  const prompt = `
You are an expert AI Investment Analyst.
Review the following REAL-TIME market data and recent news for ${quote.name} (${quote.symbol}) and provide a definitive investment verdict ("INVEST", "PASS", or "HOLD").

Company: ${quote.name} (${quote.symbol})
Current Price: ${quote.price} ${quote.currency}
Today's Change: ${quote.changePercent !== undefined ? quote.changePercent.toFixed(2) + '%' : 'N/A'}
30-Day Trend: ${quote.thirtyDayChangePercent !== null && quote.thirtyDayChangePercent !== undefined ? quote.thirtyDayChangePercent.toFixed(2) + '%' : 'N/A'}
Market Cap: ${formatMarketCap(quote.marketCap)}
P/E Ratio (Trailing): ${quote.peRatio ?? 'N/A'}
52-Week Range: ${quote.fiftyTwoWeekLow ?? 'N/A'} - ${quote.fiftyTwoWeekHigh ?? 'N/A'} ${quote.currency}

Recent News & Sentiment:
${newsText}

Respond ONLY with a valid JSON object in this exact format with NO markdown wrapping:
{
  "verdict": "INVEST",
  "confidence": 85,
  "rationale": "2-3 sentence clear, high-quality explanation of the verdict based on the real financial metrics and news.",
  "keyDrivers": ["Key positive factor or catalyst 1", "Key positive factor or catalyst 2", "Key positive factor or catalyst 3"],
  "keyRisks": ["Main risk factor 1", "Main risk factor 2", "Main risk factor 3"]
}
`;

  let decision = parseAiDecision('', quote);
  const llm = getLlmClient();
  if (llm) {
    try {
      const response = await llm.invoke([
        new SystemMessage("You are a strict financial AI analyst. Output strictly valid JSON with no backticks."),
        new HumanMessage(prompt)
      ]);
      decision = parseAiDecision(response.content, quote);
    } catch (err) {
      console.warn("AI synthesis error:", err.message);
    }
  } else {
    console.warn("GEMINI_API_KEY not configured; returning heuristic fallback decision.");
  }

  return {
    symbol: quote.symbol,
    name: quote.name,
    price: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,
    thirtyDayChangePercent: quote.thirtyDayChangePercent,
    currency: quote.currency,
    marketCap: quote.marketCap,
    marketCapFormatted: formatMarketCap(quote.marketCap),
    peRatio: quote.peRatio,
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
    sector: quote.sector,
    verdict: decision.verdict,
    confidence: decision.confidence,
    rationale: decision.rationale,
    keyDrivers: decision.keyDrivers,
    keyRisks: decision.keyRisks,
    aiFallback: decision.aiFallback,
    news: newsArticles,
    historicalData,
    analyzedAt: new Date().toISOString()
  };
}

function validateCompanyInput(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    return { valid: false, error: 'Please enter a company name or stock symbol.' };
  }
  if (value.length > 100) {
    return { valid: false, error: 'Company name or symbol must be 100 characters or fewer.' };
  }
  return { valid: true, value };
}

// REST Endpoints
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      tavilyConfigured: Boolean(process.env.TAVILY_API_KEY)
    }
  });
});

app.post('/api/analyze', async (req, res) => {
  const validation = validateCompanyInput(req.body?.company);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  try {
    const result = await performResearch(validation.value);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO Real-time Handler
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('start_research', async (payload) => {
    try {
      const rawCompany = typeof payload === 'string'
        ? payload
        : (payload?.company || payload?.symbol || '');
      const validation = validateCompanyInput(rawCompany);

      if (!validation.valid) {
        socket.emit('research_error', { message: validation.error });
        return;
      }

      const result = await performResearch(validation.value, (progress) => {
        socket.emit('agent_status', progress);
      });

      socket.emit('research_complete', result);
    } catch (error) {
      console.error("Research error:", error.message);
      socket.emit('research_error', { message: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`⚠️ Port ${PORT} in use.`);
  } else if (err.code === 'EPERM') {
    console.warn(`⚠️ Port listen permission restricted in sandbox. Ready for local execution.`);
  } else {
    console.error("Server error:", err);
  }
});

const isMainModule =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  httpServer.listen(PORT, () => {
    console.log(`🚀 AI Investment Agent Backend running on http://localhost:${PORT}`);
  });
}

export { app, httpServer };