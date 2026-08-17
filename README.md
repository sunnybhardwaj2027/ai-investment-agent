# AI Investment Agent 📈

A clean, fast, and accurate AI Investment Analyst that provides **real-time market data** and **AI-powered Invest or Pass recommendations**.

---

## 🌟 Features

- **Live Market Data**: Fetches real-time stock prices, market cap, P/E ratio, 52-week high/low, and 30-day historical price trends directly from Yahoo Finance.
- **Recent News & Market Sentiment**: Scans recent financial news and headlines using Tavily Search.
- **AI Investment Verdict**: Generates a definitive **INVEST**, **PASS**, or **HOLD** verdict with a clear 2-3 sentence executive rationale powered by Gemini.
- **Key Drivers & Risks**: Highlights positive catalysts and key risk factors.
- **30-Day Historical Price Chart**: Interactive price trend chart with hover tooltips.
- **Simple, Modern UI**: Clean dark theme with 1-click popular stock buttons (`NVDA`, `AAPL`, `TSLA`, `MSFT`, `AMZN`, etc.).

---

## 🚀 Quickstart Guide

### 1. Start Backend
```bash
cd backend
npm install
npm start
```
*Backend runs on `http://localhost:3001`.*

### 2. Start Frontend
```bash
cd frontend
npm install
npm run dev
```
*Frontend runs on `http://localhost:5173`.*