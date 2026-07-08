import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

// --- LANGCHAIN / LANGGRAPH IMPORTS ---
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { StateGraph, END } from "@langchain/langgraph";
import { TavilySearch } from "@langchain/tavily";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

// Load environment variables
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

// --- AI CONFIGURATION ---
// Initialize the LLM (Using Google Gemini)
const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash", 
    temperature: 0, // 0 ensures factual, deterministic answers
    apiKey: process.env.GEMINI_API_KEY
});

// Initialize Tavily Search Tool
const searchTool = new TavilySearch({
    maxResults: 3,
});

// --- 1. DEFINE THE STATE ---
// This is the "memory" that gets passed between nodes.
const agentState = {
    company: {
        value: null,
    },
    news: {
        value: (x, y) => y, // Simply overwrite the previous news value
        default: () => null,
    },
    financials: {
        value: (x, y) => y,
        default: () => null,
    },
    verdict: {
        value: (x, y) => y,
        default: () => null,
    },
    rationale: {
        value: (x, y) => y,
        default: () => null,
    }
};

// --- 2. DEFINE THE NODES (The steps in the workflow) ---

// Node A: Search the web for recent news
const searchNode = async (state) => {
    const { company } = state;
    const query = `recent financial news and market sentiment for ${company}`;
    
    // Call the Tavily tool with the correct schema key ('query' instead of 'input')
    const searchResults = await searchTool.invoke({ query: query });
    
    // Return updated state
    return { news: searchResults };
};

// Node B: Gather financial data
const financialNode = async (state) => {
    const { company } = state;
    
    // Generate some "random" metrics to make the analysis unique
    const peRatio = (Math.random() * (40 - 10) + 10).toFixed(2);
    const growth = (Math.random() * (20 - 1) + 1).toFixed(1);
    
    const dynamicFinancials = `Current metrics for ${company}: Growth rate is ${growth}%. P/E ratio is ${peRatio}. Recent volatility is considered moderate to high.`;
    
    return { financials: dynamicFinancials };
};

// Node C: The LLM makes the final decision
const decisionNode = async (state) => {
    const { company, news, financials } = state;
    
    const prompt = `
    You are an expert AI Investment Analyst.
    Your task is to review the following data about ${company} and make a definitive "INVEST" or "PASS" recommendation.

    Recent News & Sentiment:
    ${news}

    Financial Metrics:
    ${financials}

    You must respond ONLY with a valid JSON object in the following format. Do not include markdown formatting or backticks, just the raw JSON:
    {
        "verdict": "INVEST" or "PASS",
        "rationale": "A 2-3 sentence explanation of your decision based on the provided data."
    }
    `;

    const response = await llm.invoke([
        new SystemMessage("You are a strict JSON-only outputting financial AI."),
        new HumanMessage(prompt)
    ]);

    // Parse the JSON string returned by the LLM
    try {
        const parsedDecision = JSON.parse(response.content.trim());
        return { 
            verdict: parsedDecision.verdict, 
            rationale: parsedDecision.rationale 
        };
    } catch (error) {
        console.error("Failed to parse LLM JSON:", response.content);
        return {
            verdict: "PASS",
            rationale: "Error processing the final decision. Defaulting to PASS due to risk."
        };
    }
};

// --- 3. COMPILE THE GRAPH ---
const workflow = new StateGraph({ channels: agentState })
    .addNode("search", searchNode)
    .addNode("gather_financials", financialNode)
    .addNode("decision", decisionNode)
    
    // Define the sequence of events
    .addEdge("search", "gather_financials")
    .addEdge("gather_financials", "decision")
    .addEdge("decision", END)
    
    // Set the starting point
    .setEntryPoint("search");

// Compile it into an executable app
const appAgent = workflow.compile();


// --- WEBSOCKET CONNECTION ---
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('start_research', async (companyName) => {
    console.log(`Starting research for: ${companyName}`);
    
    try {
        // We will emit status messages *before* running the graph for now, 
        // to keep the frontend responsive while the LLM thinks.
        socket.emit('agent_status', { step: 1, message: `Initializing research agent for ${companyName}...` });
        
        socket.emit('agent_status', { step: 2, message: `Searching the web via Tavily for recent news...` });
        
        socket.emit('agent_status', { step: 3, message: `Analyzing financial data...` });
        
        socket.emit('agent_status', { step: 4, message: `Synthesizing data and generating final verdict...` });

        // RUN THE LANGGRAPH AGENT
        // We pass in the initial state (just the company name)
        const finalState = await appAgent.invoke({ company: companyName });

        console.log("Agent finished. Final State:", finalState);

        // Send the final result back to the React frontend
        socket.emit('research_complete', { 
            company: finalState.company,
            verdict: finalState.verdict, 
            rationale: finalState.rationale 
        });

    } catch (error) {
        console.error("Agent Error:", error);
        socket.emit('agent_status', { step: 'error', message: `Critical error during analysis: ${error.message}` });
        socket.emit('research_complete', { 
            verdict: "PASS", 
            rationale: "Analysis failed due to a system error." 
        });
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});