import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
// FIX: Import the class directly for v3 compatibility
import YahooFinance from 'yahoo-finance2'; 
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { TavilySearch } from "@langchain/tavily";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

dotenv.config();

// FIX: Ignore self-signed certificate errors caused by local firewalls/proxies/VPNs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// FIX: Properly initialize the client and suppress warnings the v3 way
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // FIX: Allow any domain to connect (You can restrict this to your Vercel URL later)
    methods: ["GET", "POST"]
  }
});

const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash", // FIX: Reverted to the correct working model version
    temperature: 0,
    apiKey: process.env.GEMINI_API_KEY
});

const searchTool = new TavilySearch({
    maxResults: 3,
});

const searchNode = async (state) => {
    const { company } = state;
    try {
        const query = `recent financial news and market sentiment for ${company}`;
        const searchResults = await searchTool.invoke({ query: query });
        return { news: searchResults };
    } catch (error) {
        console.error("Tavily Search Error:", error);
        return { news: "Could not fetch recent news." };
    }
};

const financialNode = async (state) => {
    const { company } = state;
    try {
        // 1. Search for the company symbol first (fixes "nvidia" vs "NVDA")
        const searchResults = await yahooFinance.search(company);
        if (!searchResults || !searchResults.quotes || searchResults.quotes.length === 0) {
            return { financials: `No financial data found for ${company}.`, historicalData: [] };
        }
        
        // FIX: Ensure the quote actually has a symbol to prevent "Cannot read properties of undefined"
        const firstQuote = searchResults.quotes.find(q => q.symbol);
        if (!firstQuote) {
             return { financials: `No valid stock symbol found for ${company}.`, historicalData: [] };
        }
        const symbol = firstQuote.symbol;
        
        // 2. Fetch live quote
        const quote = await yahooFinance.quote(symbol);
        if (!quote) {
             return { financials: `Unable to fetch quote details for ${symbol}.`, historicalData: [] };
        }
        
        // 3. Fetch last 30 days of historical data using proper Date objects
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 30);
        
        // FIX: Using chart() with actual Date objects
        const chartData = await yahooFinance.chart(symbol, { 
            period1: startDate, 
            period2: endDate 
        });
        
        const formattedHistory = (chartData && chartData.quotes) ? chartData.quotes.map(item => ({
            date: item.date.toISOString().split('T')[0],
            price: item.close
        })) : [];

        return { 
            financials: `Symbol: ${quote.symbol}, Price: ${quote.regularMarketPrice}, Market Cap: ${quote.marketCap}`,
            historicalData: formattedHistory
        };
    } catch (error) {
        console.error("Yahoo Finance Error:", error);
        return { financials: "Unable to retrieve real-time financial data.", historicalData: [] };
    }
};

const decisionNode = async (state) => {
    const { company, news, financials } = state;
    
    const prompt = `
    You are an expert AI Investment Analyst.
    Your task is to review the following data about ${company} and make a definitive "INVEST" or "PASS" recommendation.

    Recent News & Sentiment:
    ${news}

    Financial Metrics:
    ${financials}

    You must respond ONLY with a valid JSON object in the following format:
    {
        "verdict": "INVEST" or "PASS",
        "rationale": "A 2-3 sentence explanation."
    }
    `;

    try {
        const response = await llm.invoke([
            new SystemMessage("You are a strict JSON-only outputting financial AI."),
            new HumanMessage(prompt)
        ]);
        
        // Robust JSON parsing to strip out markdown backticks
        const cleanContent = response.content.trim().replace(/```json/g, "").replace(/```/g, "");
        const parsedDecision = JSON.parse(cleanContent);
        
        return { 
            verdict: parsedDecision.verdict, 
            rationale: parsedDecision.rationale 
        };
    } catch (error) {
        console.error("Decision Node Parsing Error:", error);
        return {
            verdict: "PASS",
            rationale: `System error during AI analysis: ${error.message}`
        };
    }
};

io.on('connection', (socket) => {
  socket.on('start_research', async (companyName) => {
    try {
        // Step 1
        socket.emit('agent_status', { step: 1, message: `Initializing research for ${companyName}...` });
        
        // Step 2
        socket.emit('agent_status', { step: 2, message: `Searching web for news...` });
        const news = await searchNode({ company: companyName });
        
        // Step 3
        socket.emit('agent_status', { step: 3, message: `Fetching live stock data...` });
        const financials = await financialNode({ company: companyName });
        
        // Step 4
        socket.emit('agent_status', { step: 4, message: `Generating verdict...` });
        const decision = await decisionNode({ company: companyName, ...news, ...financials });

        // Final result including chart data
        socket.emit('research_complete', { 
            verdict: decision.verdict, 
            rationale: decision.rationale,
            historicalData: financials.historicalData 
        });
    } catch (error) {
        console.error(error);
        socket.emit('research_complete', { verdict: "PASS", rationale: "System error: " + error.message });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});