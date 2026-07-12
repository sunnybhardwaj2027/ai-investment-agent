AI Investment Research Agent 📈

An intelligent, autonomous AI agent that performs real-time financial research on any given company and outputs a definitive "INVEST" or "PASS" recommendation, backed by rationale and live market data.

Live Demo: https://ai-investment-agent-lilac.vercel.app/

(Note: The backend is hosted on a free Render instance, which may take ~50 seconds to spin up on the first request).

🚀 Overview

What it does: The user enters a company name (e.g., "apple", "NVDA"). The AI agent autonomously searches the web for recent news, fetches real-time stock quotes, and analyzes 30-day historical pricing. Based on this compiled context, an LLM evaluates the company's current standing and provides a structured investment decision alongside the live price chart.

This project was built for the InsideIIM x Altuni AI Labs Product Development Engineer (Intern) assignment.

⚙️ How to Run it Locally

Prerequisites

Node.js (v18+)

API Keys for Gemini (Google AI Studio) and Tavily Search.

1. Backend Setup

Navigate to the backend directory and install dependencies:

cd backend
npm install


Create a .env file in the backend directory:

GEMINI_API_KEY=your_gemini_api_key
TAVILY_API_KEY=your_tavily_api_key
PORT=3001


Start the server:

node index.js


2. Frontend Setup

Open a new terminal, navigate to the frontend directory, and install dependencies:

cd frontend
npm install --legacy-peer-deps


(Note: --legacy-peer-deps is required to resolve a known conflict between Vite and the react-is dependency required by Recharts).

Create a .env file in the frontend directory:

VITE_BACKEND_URL=http://localhost:3001


Start the development server:

npm run dev


🧠 How it Works (Approach & Architecture)

The application uses a decoupled client-server architecture:

Frontend: React (Vite) + Tailwind CSS + Recharts for data visualization.

Backend: Node.js (Express) + Socket.io for real-time streaming + LangGraph.js for agent orchestration.

The Agentic Workflow:
The core intelligence is modeled as a state machine using LangGraph. When a request is received, the agent progresses through a defined graph:

searchNode: Invokes TavilySearch to fetch the top 3 most recent news articles and market sentiment regarding the company.

financialNode: Uses yahoo-finance2 to:

Perform a symbol lookup (allowing users to search "apple" instead of "AAPL").

Fetch live quote data (Price, Market Cap, P/E).

Fetch 30-day historical pricing data using the chart() method.

decisionNode: Compiles the news and financial metrics into a strict system prompt and invokes the gemini-2.5-flash model. The LLM is instructed to act as a strict JSON-outputting financial analyst, returning a definitive verdict and rationale.

Real-time Streaming:
Because agentic workflows take several seconds to complete multiple API calls, standard REST APIs provide poor UX. I utilized WebSockets (Socket.io) to stream the agent's thought process step-by-step to the frontend, drastically improving perceived performance.

⚖️ Key Decisions & Trade-offs

LangGraph over Simple Chains: While a simple sequential LangChain could have worked for this basic flow, LangGraph was explicitly chosen to align with modern AI engineering practices. It allows for future cyclic, non-deterministic workflows (e.g., if the LLM decides the financials look suspicious, it can loop back and trigger a deeper search node).

Socket.io vs REST: Chosen to provide the "Agent Thought Process" UI. Trade-off: Requires persistent connections, which is slightly more complex to scale horizontally than stateless REST, but the UX benefit for AI workflows is worth it.

Yahoo Finance API: Chosen for free, real-time data access. Trade-off: It required custom error handling and bypassing local SSL strictness (NODE_TLS_REJECT_UNAUTHORIZED) to function smoothly, and is less reliable than enterprise APIs like Bloomberg or Polygon.io.

Gemini 2.5 Flash: Chosen for its extremely fast inference speed and generous free tier, making it ideal for a real-time agent where latency is a primary concern.

📊 Example Runs

1. Input: "Nvidia"

Verdict: INVEST

Rationale: Nvidia continues to dominate the AI chip market with record-breaking earnings and massive demand for its architecture. Despite high valuations, the growth trajectory and market sentiment remain overwhelmingly positive.

2. Input: "Intel"

Verdict: PASS

Rationale: Intel is currently facing significant turnaround challenges, losing market share to competitors like AMD and struggling with foundry delays. Recent financial metrics show depressed margins, making it a risky investment at this time.

🔮 What I would improve with more time

Multi-Agent Debate: Implement a "Bull Agent" (looking for growth) and a "Bear Agent" (looking for risks) in LangGraph that debate the stock's merits before a final "Judge Agent" makes the call.

Caching Layer: Implement Redis to cache financial data and news for 15 minutes. This would eliminate redundant API calls and make searches for trending stocks instant.

Risk Profiling: Add a UI toggle allowing the user to select their risk appetite (Conservative, Moderate, Aggressive). This selection would be passed as context to the decisionNode, dynamically altering the LLM's system prompt and investment criteria.

Note: As per the assignment requirements, the complete LLM chat transcript documenting the development and debugging process of this application is included in the submission bundle.