import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMarketCap,
  pickBestQuoteSymbol,
  resolveStockSymbol,
  fetchMarketDataAndHistory,
  parseAiDecision,
  normalizeVerdict
} from '../index.js';

test('formatMarketCap formats trillions, billions, millions, and invalid values', () => {
  assert.equal(formatMarketCap(3_450_000_000_000), '$3.45T');
  assert.equal(formatMarketCap(120_500_000_000), '$120.50B');
  assert.equal(formatMarketCap(55_250_000), '$55.25M');
  assert.equal(formatMarketCap(null), 'N/A');
  assert.equal(formatMarketCap(0), 'N/A');
  assert.equal(formatMarketCap(-100), 'N/A');
});

test('pickBestQuoteSymbol prefers exact ticker match and preferred quote types', () => {
  const quotes = [
    { symbol: 'ORCL-USD', quoteType: 'CRYPTOCURRENCY' },
    { symbol: 'ORCL', quoteType: 'EQUITY' }
  ];
  assert.equal(pickBestQuoteSymbol(quotes, 'ORCL'), 'ORCL');
  assert.equal(pickBestQuoteSymbol([{ symbol: 'BA', quoteType: 'EQUITY' }], 'BOEING'), 'BA');
  assert.equal(pickBestQuoteSymbol([], 'NONE'), null);
});

test('resolveStockSymbol maps known aliases and queries Yahoo Search for 1-6 letter company names', async () => {
  assert.equal(await resolveStockSymbol('apple'), 'AAPL');
  assert.equal(await resolveStockSymbol('$NVDA'), 'NVDA');
  assert.equal(await resolveStockSymbol('RELIANCE.NS'), 'RELIANCE.NS');

  let searchedUrl = '';
  const mockFetch = async (url) => {
    searchedUrl = url;
    return {
      ok: true,
      json: async () => ({
        quotes: [{ symbol: 'SNOW', quoteType: 'EQUITY' }]
      })
    };
  };

  // "SNOWFL" (6 chars, not in COMMON_TICKERS) should query Yahoo Search instead of returning "SNOWFL"
  const resolved = await resolveStockSymbol('Snowfl', { fetch: mockFetch });
  assert.equal(resolved, 'SNOW');
  assert.match(searchedUrl, /query2\.finance\.yahoo\.com\/v1\/finance\/search\?q=Snowfl/);
});

test('fetchMarketDataAndHistory computes daily change separately from 30-day trend', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      chart: {
        result: [
          {
            meta: {
              symbol: 'TEST',
              shortName: 'Test Corp',
              currency: 'USD',
              regularMarketPrice: 110,
              previousClose: 100,
              chartPreviousClose: 80,
              fiftyTwoWeekHigh: 120,
              fiftyTwoWeekLow: 70
            },
            timestamp: [1700000000, 1700086400, 1700172800],
            indicators: {
              quote: [{ close: [85, 100, 110] }]
            }
          }
        ]
      }
    })
  });

  const mockYf = {
    quote: async () => {
      throw new Error('quote disabled in test');
    }
  };

  const { quote, historicalData } = await fetchMarketDataAndHistory('TEST', {
    fetch: mockFetch,
    yahooFinance: mockYf
  });

  assert.equal(quote.price, 110);
  assert.equal(quote.change, 10);
  assert.equal(quote.changePercent, 10);
  assert.equal(quote.thirtyDayChangePercent, 37.5);
  assert.equal(historicalData.length, 3);
});

test('parseAiDecision handles fenced JSON, array content blocks, and malformed fallback', () => {
  const quote = { name: 'NVIDIA', symbol: 'NVDA', price: 140, currency: 'USD', changePercent: 2.5, marketCap: 3.4e12 };

  const valid = parseAiDecision('```json\n{"verdict":"buy","confidence":0.88,"rationale":"Strong AI demand.","keyDrivers":["GPUs"],"keyRisks":["Valuation"]}\n```', quote);
  assert.equal(valid.verdict, 'INVEST');
  assert.equal(valid.confidence, 88);
  assert.equal(valid.aiFallback, false);

  const blockArray = parseAiDecision([{ type: 'text', text: '{"verdict":"PASS","confidence":72,"rationale":"High risk.","keyDrivers":[],"keyRisks":["Debt"]}' }], quote);
  assert.equal(blockArray.verdict, 'PASS');
  assert.equal(blockArray.confidence, 72);
  assert.equal(blockArray.aiFallback, false);

  const fallback = parseAiDecision('not valid json', quote);
  assert.equal(fallback.aiFallback, true);
  assert.equal(fallback.verdict, 'INVEST');
});

test('normalizeVerdict maps synonyms consistently', () => {
  assert.equal(normalizeVerdict('STRONG BUY'), 'INVEST');
  assert.equal(normalizeVerdict('SELL'), 'PASS');
  assert.equal(normalizeVerdict('HOLD'), 'HOLD');
  assert.equal(normalizeVerdict('unknown', 'PASS'), 'PASS');
});
