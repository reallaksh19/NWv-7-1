import { getSettings } from '../utils/storage.js';
import { getRuntimeCapabilities } from "../runtime/runtimeCapabilities.js";

const INDICES = { nifty50: '^NSEI', sensex: '^BSESN', niftyBank: '^NSEBANK', niftyIT: '^CNXIT', niftyMidcap: 'NIFTYMIDCAP150.NS', niftyPharma: '^CNXPHARMA', niftyAuto: '^CNXAUTO', sp500: '^GSPC', nasdaq: '^IXIC', dow: '^DJI', nikkei225: '^N225', hangSeng: '^HSI', ftse100: '^FTSE' };
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const PROXIES = [(url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`];
const CACHE_KEY = 'indian_market_data';
const CACHE_TTL = 4 * 60 * 60 * 1000;
const MARKET_SNAPSHOT_API = '/api/market_snapshot';

function isStaticHostRuntime() { return getRuntimeCapabilities().isStaticHost; }



async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

async function fetchThroughProxies(url, parser = 'json', timeoutMs = 10000) {
    for (const proxyGen of PROXIES) {
        try {
            const response = await fetchWithTimeout(proxyGen(url), {}, timeoutMs);
            if (!response.ok) continue;
            return parser === 'text' ? await response.text() : await response.json();
        } catch (e) {
            console.warn(`[MarketService] Proxy failed: ${e.message}`);
        }
    }
    throw new Error(`Failed to fetch ${url}`);
}

async function fetchYahooData(symbol, { range = '1d', interval = '1d' } = {}) {
    return fetchThroughProxies(`${YAHOO_BASE}${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`, 'json');
}

function parseYahooSeries(data) {
    const result = data.chart?.result?.[0] || data.finance?.result?.[0];
    const timestamps = result?.timestamp || [];
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const opens = result?.indicators?.quote?.[0]?.open || [];
    const highs = result?.indicators?.quote?.[0]?.high || [];
    const lows = result?.indicators?.quote?.[0]?.low || [];
    return timestamps.map((timestamp, index) => {
        const close = closes[index];
        if (close == null) return null;
        return { timestamp: timestamp * 1000, close, open: opens[index] ?? close, high: highs[index] ?? close, low: lows[index] ?? close };
    }).filter(Boolean);
}

function extractYahooPrice(data) {
    const result = data.chart?.result?.[0] || data.finance?.result?.[0];
    if (!result || !result.meta) return null;
    const quote = result.meta;
    const currentPrice = quote.regularMarketPrice;
    const prevClose = quote.chartPreviousClose || quote.previousClose;
    const change = currentPrice - prevClose;
    const changePercent = prevClose ? ((change / prevClose) * 100) : 0;
    const timestamp = quote.regularMarketTime ? quote.regularMarketTime * 1000 : Date.now();
    return { price: currentPrice, change, changePercent: changePercent.toFixed(2), timestamp };
}

export async function fetchIndices() {
    const promises = Object.entries(INDICES).map(async ([name, symbol]) => {
        try {
            const data = await fetchYahooData(symbol, { range: '5d', interval: '1d' });
            const priceData = extractYahooPrice(data);
            const series = parseYahooSeries(data);
            if (!priceData) return null;
            const labels = { nifty50: 'NIFTY 50', sensex: 'SENSEX', niftyBank: 'BANK NIFTY', niftyIT: 'NIFTY IT', niftyMidcap: 'MIDCAP 150', niftyPharma: 'NIFTY PHARMA', niftyAuto: 'NIFTY AUTO', sp500: 'S&P 500', nasdaq: 'NASDAQ', dow: 'DOW', nikkei225: 'NIKKEI 225', hangSeng: 'HANG SENG', ftse100: 'FTSE 100' };
            return { name: labels[name] || 'MARKET', symbol, value: priceData.price.toLocaleString('en-IN'), change: priceData.change.toFixed(2), changePercent: priceData.changePercent, direction: priceData.change >= 0 ? 'up' : 'down', currency: '₹', timestamp: priceData.timestamp, history: series.map((point) => point.close), series, dayOpen: series[0]?.open ?? priceData.price, dayHigh: series.length ? Math.max(...series.map((point) => Number(point.high || point.close))) : priceData.price, dayLow: series.length ? Math.min(...series.map((point) => Number(point.low || point.close))) : priceData.price };
        } catch { return null; }
    });
    const results = (await Promise.all(promises)).filter(Boolean);
    return results;
}

const MF_API = 'https://api.mfapi.in/mf/';
const POPULAR_MF_SCHEMES = [{ code: '119551', name: 'SBI Bluechip Fund' }, { code: '120503', name: 'HDFC Mid-Cap Opportunities' }, { code: '118834', name: 'ICICI Prudential Value Discovery' }, { code: '122639', name: 'Axis Long Term Equity Fund' }, { code: '125354', name: 'Mirae Asset Large Cap Fund' }, { code: '118989', name: 'Kotak Emerging Equity Fund' }];
const FUND_TYPE_LABELS = { 'large-cap': 'Large Cap', 'mid-cap': 'Mid Cap', 'flexi-cap': 'Flexi Cap', value: 'Value', elss: 'ELSS' };
function classifyMutualFundType(name = '', category = '') { const text = `${name} ${category}`.toLowerCase(); if (/(elss|tax saver|long term equity)/.test(text)) return 'elss'; if (/(value|contra|dividend yield)/.test(text)) return 'value'; if (/(mid[- ]?cap|midcap|emerging|small[- ]?cap)/.test(text)) return 'mid-cap'; if (/(large[- ]?cap|bluechip|index)/.test(text)) return 'large-cap'; return 'flexi-cap'; }
function enrichMutualFundRecord(record, fallbackName) { const fundType = classifyMutualFundType(record?.name || fallbackName, record?.category); return { ...record, fundType, fundTypeLabel: FUND_TYPE_LABELS[fundType] || 'Flexi Cap' }; }
async function fetchAmfiNavFeed() { return fetchThroughProxies('https://portal.amfiindia.com/spages/NAVAll.txt', 'text'); }
function parseAmfiNavFeed(text) { const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean); const parsed = []; for (const scheme of POPULAR_MF_SCHEMES) { const match = lines.find((line) => line.toLowerCase().includes(scheme.name.toLowerCase())); if (!match) continue; const parts = match.split(';').map((part) => part.trim()).filter(Boolean); const numericCandidates = parts.map((part) => Number(String(part).replace(/,/g, ''))).filter((value) => Number.isFinite(value)); const navCandidate = numericCandidates[numericCandidates.length - 1]; const dateMatch = match.match(/(\d{2}-[A-Za-z]{3}-\d{4})/); const navDate = dateMatch ? dateMatch[1] : ''; if (Number.isFinite(navCandidate)) parsed.push({ code: scheme.code, name: scheme.name, category: 'Equity', fundHouse: 'AMFI', nav: navCandidate.toFixed(2), navDate, change: '0.00', changePercent: '0.00', direction: 'up', source: 'amfi', ...enrichMutualFundRecord({ name: scheme.name, category: 'Equity' }, scheme.name) }); } return parsed; }
export async function fetchMutualFunds() {
    try { const parsed = parseAmfiNavFeed(await fetchAmfiNavFeed()); if (parsed.length > 0) return parsed; } catch {}
    const results = await Promise.allSettled(POPULAR_MF_SCHEMES.map(async (scheme) => {
        const response = await fetch(`${MF_API}${scheme.code}`); const data = await response.json(); if (!data.data || data.data.length === 0) throw new Error('No NAV data');
        const latestNAV = parseFloat(data.data[0].nav); const prevNAV = data.data.length > 1 ? parseFloat(data.data[1].nav) : latestNAV; const change = latestNAV - prevNAV; const changePercent = ((change / prevNAV) * 100).toFixed(2);
        return { code: scheme.code, name: data.meta?.scheme_name || scheme.name, category: data.meta?.scheme_category || 'Equity', fundHouse: data.meta?.fund_house || 'Unknown', nav: latestNAV.toFixed(2), navDate: data.data[0].date, change: change.toFixed(2), changePercent, direction: change >= 0 ? 'up' : 'down', source: 'mfapi', ...enrichMutualFundRecord({ name: data.meta?.scheme_name || scheme.name, category: data.meta?.scheme_category || 'Equity' }, scheme.name) };
    }));
    return results.filter(r => r.status === 'fulfilled').map(r => r.value);
}

export async function fetchIPOData() {
    if (isStaticHostRuntime()) { return { upcoming: [], live: [], recent: [], fetchedAt: Date.now(), source: 'static-host-disabled' }; }
    const targetUrl = 'https://ipowatch.in/upcoming-ipo-calendar-ipo-list/';
    try {
        const html = await fetchThroughProxies(targetUrl, 'text');
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const tables = doc.querySelectorAll('table');
        let table = null;
        for (const t of tables) { const text = t.textContent.toLowerCase(); if ((text.includes('ipo') && text.includes('price')) || text.includes('ipo name')) { table = t; break; } }
        if (!table) throw new Error('No IPO table found');
        const rows = Array.from(table.querySelectorAll('tr')); const ipos = [];
        for (let i = 1; i < rows.length; i++) {
            const cols = rows[i].querySelectorAll('td'); if (cols.length < 3) continue;
            const name = cols[0]?.textContent?.trim() || 'Unknown'; let statusRaw = cols[1]?.textContent?.trim() || 'Upcoming'; let dateRaw = cols[2]?.textContent?.trim() || 'TBA';
            let status = 'upcoming'; const lowerStatus = statusRaw.toLowerCase(); if (lowerStatus.includes('live') || lowerStatus.includes('open')) status = 'live'; else if (lowerStatus.includes('close')) status = 'recent';
            const isSME = name.includes('SME') || table.textContent.includes('SME'); ipos.push({ name, openDate: dateRaw, closeDate: '', status, isSME, issueSize: '-' });
        }
        return { upcoming: ipos.filter(i => i.status === 'upcoming').slice(0, 5), live: ipos.filter(i => i.status === 'live'), recent: ipos.filter(i => i.status === 'recent').slice(0, 5), fetchedAt: Date.now() };
    } catch (err) {
        return { upcoming: [], live: [], recent: [], fetchedAt: Date.now(), error: err.message };
    }
}

const SCREENER_URL = 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved/screener/new?scrIds=day_gainers&count=5';
const SCREENER_URL_LOSERS = 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved/screener/new?scrIds=day_losers&count=5';
async function fetchScreenerData(url) {
    try {
        const data = await fetchThroughProxies(url, 'json');
        const results = data.finance?.result?.[0]?.quotes || [];
        return results.map(quote => ({ symbol: quote.symbol.replace('.NS', '').replace('.BO', ''), price: quote.regularMarketPrice?.toFixed(2) || '0.00', change: quote.regularMarketChange?.toFixed(2) || '0.00', changePercent: quote.regularMarketChangePercent?.toFixed(2) || '0.00', direction: (quote.regularMarketChange || 0) >= 0 ? 'up' : 'down', volume: quote.regularMarketVolume })).filter(q => q.symbol);
    } catch { return []; }
}

const TOP_STOCKS = ['RELIANCE.NS','TCS.NS','HDFCBANK.NS','INFY.NS','ICICIBANK.NS','HINDUNILVR.NS','SBIN.NS','BHARTIARTL.NS','ITC.NS','KOTAKBANK.NS','LT.NS','AXISBANK.NS','ASIANPAINT.NS','MARUTI.NS','BAJFINANCE.NS'];
async function fetchTopMoversFallback() {
    const quotes = await Promise.allSettled(TOP_STOCKS.map(async (symbol) => {
        const data = await fetchYahooData(symbol, { range: '5d', interval: '1d' }); const priceData = extractYahooPrice(data); if (!priceData) return null;
        return { symbol: symbol.replace('.NS', '').replace('.BO', ''), price: priceData.price.toFixed(2), change: priceData.change.toFixed(2), changePercent: priceData.changePercent, direction: priceData.change >= 0 ? 'up' : 'down', timestamp: priceData.timestamp };
    }));
    const valid = quotes.filter((item) => item.status === 'fulfilled' && item.value).map((item) => item.value);
    return { gainers: valid.filter((item) => item.direction === 'up').sort((a, b) => Number(b.changePercent) - Number(a.changePercent)).slice(0, 5), losers: valid.filter((item) => item.direction === 'down').sort((a, b) => Number(a.changePercent) - Number(b.changePercent)).slice(0, 5), source: 'yahoo-quote' };
}
export async function fetchTopMovers() { const [gainers, losers] = await Promise.all([fetchScreenerData(SCREENER_URL), fetchScreenerData(SCREENER_URL_LOSERS)]); if (gainers.length || losers.length) return { gainers: gainers.slice(0, 5), losers: losers.slice(0, 5), source: 'yahoo-screener' }; return fetchTopMoversFallback(); }
export async function fetchSectoralIndices() { const sectorals = [{ key: 'niftyBank', name: 'Bank Nifty', symbol: INDICES.niftyBank }, { key: 'niftyIT', name: 'Nifty IT', symbol: INDICES.niftyIT }, { key: 'niftyPharma', name: 'Nifty Pharma', symbol: INDICES.niftyPharma }, { key: 'niftyAuto', name: 'Nifty Auto', symbol: INDICES.niftyAuto }]; const results = await Promise.allSettled(sectorals.map(async (sector) => { const data = await fetchYahooData(sector.symbol, { range: '5d', interval: '1d' }); const priceData = extractYahooPrice(data); if (!priceData) throw new Error('No data'); return { name: sector.name, value: priceData.price.toFixed(2), change: priceData.change.toFixed(2), changePercent: priceData.changePercent, timestamp: priceData.timestamp }; })); return results.filter(r => r.status === 'fulfilled').map(r => r.value); }
export async function fetchCommodities() { return []; }
export async function fetchCurrencyRates() { return []; }
export async function fetchFIIDII() { return { fii: {}, dii: {}, date: '' }; }
export async function fetchStaticSnapshot() { try { const resp = await fetch('/data/market_snapshot.json'); if (resp.ok) return await resp.json(); } catch {} return null; }
async function saveMarketSnapshot(snapshot) { if (isStaticHostRuntime()) return false; try { const response = await fetch(MARKET_SNAPSHOT_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot) }); return response.ok; } catch { return false; } }

export async function fetchAllMarketData() {
    if (isStaticHostRuntime()) {
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                const age = Date.now() - (parsed.fetchedAt || 0);
                if (age < CACHE_TTL) return { ...parsed, isStale: true, staleReason: 'Static host cache' };
            }
        } catch {}
        const snapshot = await fetchStaticSnapshot();
        if (snapshot) {
            return { ...snapshot, isSnapshot: true, fetchedAt: snapshot.generatedAt ? new Date(snapshot.generatedAt).getTime() : Date.now() };
        }
        return { indices: [], mutualFunds: [], ipo: { upcoming: [], live: [], recent: [] }, movers: { gainers: [], losers: [] }, sectorals: [], commodities: [], currencies: [], fiidii: { fii: {}, dii: {}, date: '' }, fetchedAt: Date.now(), generatedAt: new Date().toISOString(), sourceHealth: {}, errors: {} };
    }

    const [indices, mutualFunds, ipoData, movers, sectorals, commodities, currencies, fiidii] = await Promise.allSettled([fetchIndices(), fetchMutualFunds(), fetchIPOData(), fetchTopMovers(), fetchSectoralIndices(), fetchCommodities(), fetchCurrencyRates(), fetchFIIDII()]);
    const result = { indices: indices.status === 'fulfilled' ? indices.value : [], mutualFunds: mutualFunds.status === 'fulfilled' ? mutualFunds.value : [], ipo: ipoData.status === 'fulfilled' ? ipoData.value : { upcoming: [], live: [], recent: [] }, movers: movers.status === 'fulfilled' ? movers.value : { gainers: [], losers: [] }, sectorals: sectorals.status === 'fulfilled' ? sectorals.value : [], commodities: commodities.status === 'fulfilled' ? commodities.value : [], currencies: currencies.status === 'fulfilled' ? currencies.value : [], fiidii: fiidii.status === 'fulfilled' ? fiidii.value : { fii: {}, dii: {}, date: '' }, fetchedAt: Date.now(), generatedAt: new Date().toISOString(), sourceHealth: { indices: indices.status === 'fulfilled' ? 'live' : 'failed', mutualFunds: mutualFunds.status === 'fulfilled' ? 'live' : 'failed', ipo: ipoData.status === 'fulfilled' ? 'live' : 'failed', movers: movers.status === 'fulfilled' ? 'live' : 'failed', sectorals: sectorals.status === 'fulfilled' ? 'live' : 'failed', commodities: commodities.status === 'fulfilled' ? 'live' : 'failed', currencies: currencies.status === 'fulfilled' ? 'live' : 'failed', fiidii: fiidii.status === 'fulfilled' ? 'live' : 'failed' }, errors: { indices: indices.status === 'rejected' ? indices.reason?.message : null } };
    if (result.indices.length > 0) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch {}
        saveMarketSnapshot(result);
        return result;
    }
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            const age = Date.now() - (parsed.fetchedAt || 0);
            if (age < CACHE_TTL) return { ...parsed, isStale: true, staleReason: 'Network/Proxy Failure - Showing cached data' };
        }
    } catch {}
    const snapshot = await fetchStaticSnapshot();
    if (snapshot) return { ...snapshot, isSnapshot: true, fetchedAt: snapshot.generatedAt ? new Date(snapshot.generatedAt).getTime() : Date.now() };
    return result;
}

export default { fetchAllMarketData, fetchStaticSnapshot, fetchIndices, fetchMutualFunds, fetchIPOData, fetchTopMovers, fetchSectoralIndices, fetchCommodities, fetchCurrencyRates, fetchFIIDII };
