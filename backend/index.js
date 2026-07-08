import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import yahooFinance from 'yahoo-finance2';

const yf = new yahooFinance();

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { StateGraph, END } from "@langchain/langgraph";
import { TavilySearch } from "@langchain/tavily";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    temperature: 0,
    apiKey: process.env.GEMINI_API_KEY
});

const searchTool = new TavilySearch({
    maxResults: 3,
});

const agentState = {
    company: { value: null },
    news: { value: (x, y) => y, default: () => null },
    financials: { value: (x, y) => y, default: () => null },
    verdict: { value: (x, y) => y, default: () => null },
    rationale: { value: (x, y) => y, default: () => null }
};

const searchNode = async (state) => {
    const { company } = state;
    const query = `recent financial news and market sentiment for ${company}`;
    const searchResults = await searchTool.invoke({ query: query });
    return { news: searchResults };
};

const financialNode = async (state) => {
    const { company } = state;
    try {
        // First, search for the symbol to support names like "nvidia"
        const searchResults = await yf.search(company);
        if (!searchResults.quotes || searchResults.quotes.length === 0) {
            return { financials: `No financial data found for ${company}.` };
        }
        
        // Use the first result (most relevant match)
        const symbol = searchResults.quotes[0].symbol;
        const quote = await yf.quote(symbol);
        
        return { 
            financials: `
                Symbol: ${quote.symbol}
                Current Price: ${quote.regularMarketPrice}
                Market Cap: ${quote.marketCap}
                Trailing P/E: ${quote.trailingPE}
            ` 
        };
    } catch (error) {
        console.error("Yahoo Finance Error:", error);
        return { financials: "Unable to retrieve real-time financial data." };
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

    const response = await llm.invoke([
        new SystemMessage("You are a strict JSON-only outputting financial AI."),
        new HumanMessage(prompt)
    ]);

    try {
        // Robust JSON parsing to handle potential markdown
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
            rationale: "Analysis failed due to a system error."
        };
    }
};

const workflow = new StateGraph({ channels: agentState })
    .addNode("search", searchNode)
    .addNode("gather_financials", financialNode)
    .addNode("decision", decisionNode)
    .addEdge("search", "gather_financials")
    .addEdge("gather_financials", "decision")
    .addEdge("decision", END)
    .setEntryPoint("search");

const appAgent = workflow.compile();

io.on('connection', (socket) => {
  socket.on('start_research', async (companyName) => {
    try {
        socket.emit('agent_status', { step: 1, message: `Initializing research for ${companyName}...` });
        socket.emit('agent_status', { step: 2, message: `Searching web for news...` });
        const news = await searchNode({ company: companyName });
        
        socket.emit('agent_status', { step: 3, message: `Fetching live stock data...` });
        const financials = await financialNode({ company: companyName });
        
        socket.emit('agent_status', { step: 4, message: `Generating verdict...` });
        const finalState = await decisionNode({ company: companyName, ...news, ...financials });

        socket.emit('research_complete', { 
            company: companyName,
            verdict: finalState.verdict, 
            rationale: finalState.rationale 
        });
    } catch (error) {
        socket.emit('research_complete', { verdict: "PASS", rationale: "System error: " + error.message });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});