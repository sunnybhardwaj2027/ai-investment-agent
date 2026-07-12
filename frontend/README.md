AI Investment Research Agent 📈

An intelligent, autonomous AI agent that performs real-time financial research on any given company and outputs a definitive "INVEST" or "PASS" recommendation, backed by rationale and live market data.

🚀 Overview

This project is a full-stack web application built with a React frontend and a Node.js backend. The core intelligence is driven by LangGraph.js, which orchestrates a multi-step agent workflow. The agent uses the Tavily Search API for real-time market sentiment and Yahoo Finance for live stock metrics and historical data, ultimately passing the context to a Gemini LLM to make an investment decision.

⚙️ How to Run it

Prerequisites

Node.js (v18+)

API Keys for Gemini (Google AI Studio) and Tavily Search.

1. Backend Setup

cd backend
npm install


Create a .env file in the backend directory:

GEMINI_API_KEY=your_gemini_api_key
TAVILY_API_KEY=your_tavily_api_key
PORT=3001


Start the server:

node index.js


2. Frontend Setup

cd frontend
npm install


Create a .env file in the frontend directory:

VITE_BACKEND_URL=http://localhost:3001


Start the development server:

npm run dev


🧠 How it Works (Approach & Architecture)

The system is built on a streaming architecture using Socket.io to provide real-time updates to the frontend as the agent "thinks".

The agent logic is modeled as a state machine using LangGraph:

State Definition: Maintains the company name, news context, financial metrics, and the final verdict.

searchNode: Uses TavilySearch to fetch the latest news articles and market sentiment.

financialNode: Uses yahoo-finance2 to perform a symbol lookup (allowing users to type names like "apple" instead of "AAPL"), fetches live quote data (Price, Market Cap, P/E), and retrieves 30-day historical pricing for the chart.

decisionNode: Compiles the data into a strict prompt and invokes gemini-1.5-flash (or gemini-2.5-flash) to generate a structured JSON response containing the VERDICT and RATIONALE.

⚖️ Key Decisions & Trade-offs

LangGraph over Simple Chains: While a simple LangChain sequence could have worked, LangGraph was chosen to allow for future cyclic workflows (e.g., if the LLM decides it needs more specific data, it can loop back to the search node).

WebSockets vs REST: REST APIs are standard, but AI agent workflows take time (5-10 seconds). I chose Socket.io to stream the agent's thought process step-by-step to the UI, vastly improving perceived performance and UX.

Yahoo Finance API: Chosen for free, real-time data access without strict rate limits for this scale. Trade-off: It required custom error handling and date-object formatting, and might be less stable than a paid enterprise API (like Bloomberg or Polygon.io).

📊 Example Runs

1. Input: "Nvidia"

Verdict: INVEST

Rationale: Nvidia continues to dominate the AI chip market with record-breaking earnings and massive demand for its Blackwell architecture. Despite high valuations, the growth trajectory and market sentiment remain overwhelmingly positive.

2. Input: "Intel"

Verdict: PASS

Rationale: Intel is currently facing significant turnaround challenges, losing market share to competitors like AMD and struggling with foundry delays. Recent financial metrics show depressed margins, making it a risky investment at this time.

🔮 What I would improve with more time

Multi-Agent Debate: Implement a "Bull Agent" and a "Bear Agent" in LangGraph that debate the stock before a "Judge Agent" makes the final call.

Caching Layer: Implement Redis to cache financial data and news for 15 minutes to reduce API calls and speed up identical queries.

Risk Profiling: Allow the user to select their risk appetite (Conservative vs. Aggressive) in the UI, which dynamically alters the LLM's system prompt.

Note: As per the assignment requirements, the complete LLM chat transcript documenting the development and debugging process of this application is included in the root directory.