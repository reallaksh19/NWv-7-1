const DEFAULT_FEED_SOURCE_REGISTRY = Object.freeze({
  alerts: {
    Chennai: [
      { url: 'https://www.thehindu.com/news/cities/chennai/feeder/default.rss', sourceType: 'general_news', trust: 'high' },
      { url: 'https://www.dtnext.in/rss', sourceType: 'general_news', trust: 'medium' },
      { url: 'https://news.google.com/rss/search?q=Chennai+traffic+advisory+OR+power+cut+OR+water+supply&hl=en-IN&gl=IN&ceid=IN:en', sourceType: 'search', trust: 'medium' }
    ],
    Muscat: [
      { url: 'https://www.omanobserver.om/rss', sourceType: 'general_news', trust: 'medium' },
      { url: 'https://timesofoman.com/rss', sourceType: 'general_news', trust: 'medium' },
      { url: 'https://news.google.com/rss/search?q=Muscat+traffic+advisory+OR+road+closure+OR+water+supply&hl=en-US&gl=US&ceid=US:en', sourceType: 'search', trust: 'medium' }
    ],
    Trichy: [
      { url: 'https://www.thehindu.com/news/cities/Tiruchirapalli/feeder/default.rss', sourceType: 'general_news', trust: 'high' },
      { url: 'https://news.google.com/rss/search?q=Trichy+power+cut+OR+water+supply+OR+traffic+advisory&hl=en-IN&gl=IN&ceid=IN:en', sourceType: 'search', trust: 'medium' }
    ]
  },
  weather_alerts: {
    Chennai: [
      { url: 'https://news.google.com/rss/search?q=IMD+Chennai+weather+warning&hl=en-IN&gl=IN&ceid=IN:en', sourceType: 'search', trust: 'high' }
    ],
    Muscat: [
      { url: 'https://news.google.com/rss/search?q=Muscat+weather+warning+OR+Oman+weather+advisory&hl=en-US&gl=US&ceid=US:en', sourceType: 'search', trust: 'high' }
    ],
    Trichy: [
      { url: 'https://news.google.com/rss/search?q=Trichy+weather+warning+OR+Tamil+Nadu+rain+alert&hl=en-IN&gl=IN&ceid=IN:en', sourceType: 'search', trust: 'high' }
    ]
  },
  shopping: {
    online: [
      { url: 'https://news.google.com/rss/search?q=online+sale+OR+discount+OR+coupon+OR+promo+code&hl=en-IN&gl=IN&ceid=IN:en', sourceType: 'search', trust: 'medium' },
      { url: 'https://news.google.com/rss/search?q=Amazon+sale+OR+Flipkart+sale+OR+Myntra+sale&hl=en-IN&gl=IN&ceid=IN:en', sourceType: 'search', trust: 'medium' }
    ],
    Chennai: [
      { url: 'https://news.google.com/rss/search?q=Chennai+sale+OR+discount+OR+mall+offer&hl=en-IN&gl=IN&ceid=IN:en', sourceType: 'search', trust: 'medium' }
    ],
    Muscat: [
      { url: 'https://news.google.com/rss/search?q=Muscat+shopping+offer+OR+sale+OR+discount&hl=en-US&gl=US&ceid=US:en', sourceType: 'search', trust: 'medium' }
    ],
    Trichy: [
      { url: 'https://news.google.com/rss/search?q=Trichy+sale+OR+discount+OR+shopping+festival&hl=en-IN&gl=IN&ceid=IN:en', sourceType: 'search', trust: 'medium' }
    ]
  },
  airlines: {
    global: [
      { url: 'https://news.google.com/rss/search?q=Oman+Air+fare+sale+OR+IndiGo+offer+OR+Air+India+sale+OR+SalamAir+offer&hl=en-IN&gl=IN&ceid=IN:en', sourceType: 'search', trust: 'high' }
    ]
  },
  events: {
    Chennai: [
      { url: 'https://news.google.com/rss/search?q=Chennai+events+this+week+OR+concert+OR+exhibition+OR+workshop&hl=en-IN&gl=IN&ceid=IN:en', sourceType: 'search', trust: 'medium' }
    ],
    Muscat: [
      { url: 'https://news.google.com/rss/search?q=Muscat+events+this+week+OR+concert+OR+exhibition&hl=en-US&gl=US&ceid=US:en', sourceType: 'search', trust: 'medium' }
    ],
    Trichy: [
      { url: 'https://news.google.com/rss/search?q=Trichy+events+this+week+OR+exhibition+OR+cultural+event&hl=en-IN&gl=IN&ceid=IN:en', sourceType: 'search', trust: 'medium' }
    ]
  },
  movies: {
    India: [
      { url: 'https://www.hindustantimes.com/feeds/rss/entertainment/tamil-cinema/rssfeed.xml', sourceType: 'cinema', trust: 'high' },
      { url: 'https://www.hindustantimes.com/feeds/rss/entertainment/bollywood/rssfeed.xml', sourceType: 'cinema', trust: 'high' },
      { url: 'https://news.google.com/rss/search?q=OTT+release+this+week+OR+Tamil+movie+release+OR+BookMyShow+showtimes&hl=en-IN&gl=IN&ceid=IN:en', sourceType: 'search', trust: 'medium' }
    ]
  },
  festivals: {
    India: [
      { url: 'https://www.timeanddate.com/holidays/india/feed', sourceType: 'calendar', trust: 'high' }
    ],
    Oman: [
      { url: 'https://news.google.com/rss/search?q=Oman+public+holiday+OR+festival+date&hl=en-US&gl=US&ceid=US:en', sourceType: 'search', trust: 'medium' }
    ]
  }
});

function uniqByUrl(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const url = String(item?.url || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(item);
  }
  return out;
}

function normalizeLocationKey(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (['chennai', 'madras', 't nagar', 'tnagar', 'adyar', 'velachery', 'tambaram'].includes(lower)) return 'Chennai';
  if (['trichy', 'tiruchirappalli', 'srirangam', 'thillai nagar'].includes(lower)) return 'Trichy';
  if (['muscat', 'al khuwair', 'qurum', 'ruwi', 'seeb', 'mabela'].includes(lower)) return 'Muscat';
  if (['india', 'in'].includes(lower)) return 'India';
  if (['oman'].includes(lower)) return 'Oman';
  return text;
}

function normalizeCategoryKey(value) {
  const text = String(value || '').toLowerCase().trim();
  const aliases = {
    movie: 'movies',
    event: 'events',
    festival: 'festivals',
    alert: 'alerts',
    weather_alert: 'weather_alerts',
    offer: 'shopping',
    airline_offer: 'airlines'
  };
  return aliases[text] || text;
}

export function topupFeedSourceRegistry(baseRegistry = DEFAULT_FEED_SOURCE_REGISTRY, topup = {}) {
  const merged = JSON.parse(JSON.stringify(baseRegistry));
  for (const [category, locationMap] of Object.entries(topup || {})) {
    if (!merged[category]) merged[category] = {};
    for (const [location, entries] of Object.entries(locationMap || {})) {
      if (!merged[category][location]) merged[category][location] = [];
      merged[category][location] = uniqByUrl([...(merged[category][location] || []), ...(entries || [])]);
    }
  }
  return merged;
}

export function getFeedSourcesForRequest({ category, locations = [], includeOnline = true, registry = DEFAULT_FEED_SOURCE_REGISTRY } = {}) {
  const categoryKey = normalizeCategoryKey(category);
  const categoryRegistry = registry[categoryKey] || {};
  const requestedLocations = Array.isArray(locations) ? locations.map(normalizeLocationKey).filter(Boolean) : [];
  const selected = [];

  for (const location of requestedLocations) {
    if (categoryRegistry[location]) {
      selected.push(...categoryRegistry[location].map(entry => ({ ...entry, category: categoryKey, location })));
    }
  }

  if (includeOnline && categoryRegistry.online) {
    selected.push(...categoryRegistry.online.map(entry => ({ ...entry, category: categoryKey, location: 'online' })));
  }
  if (categoryRegistry.global) {
    selected.push(...categoryRegistry.global.map(entry => ({ ...entry, category: categoryKey, location: 'global' })));
  }
  if (categoryRegistry.India && requestedLocations.includes('Chennai')) {
    selected.push(...categoryRegistry.India.map(entry => ({ ...entry, category: categoryKey, location: 'India' })));
  }
  if (categoryRegistry.Oman && requestedLocations.includes('Muscat')) {
    selected.push(...categoryRegistry.Oman.map(entry => ({ ...entry, category: categoryKey, location: 'Oman' })));
  }

  return uniqByUrl(selected);
}

export function rankFeedSource(source) {
  return {
    ...source,
    priorityScore:
      (source.trust === 'high' ? 3 : source.trust === 'medium' ? 2 : 1) +
      (source.sourceType === 'government' ? 2 : 0)
  };
}

export function buildFeedFetchPlan({ categories = [], locations = [], registry = DEFAULT_FEED_SOURCE_REGISTRY, isStaticHost = false } = {}) {
  const plan = [];
  for (const category of categories || []) {
    let sources = getFeedSourcesForRequest({ category, locations, registry, includeOnline: true });

    // Phase 9: Source and feed governance
    // Apply ranking
    sources = sources.map(rankFeedSource).sort((a, b) => b.priorityScore - a.priorityScore);

    // If static host, aggressively trim lower-value feeds to save network/proxy bandwidth
    if (isStaticHost) {
      sources = sources.filter(s => s.priorityScore >= 3 || s.trust === 'high').slice(0, 2);
    }

    if (sources.length > 0) {
      plan.push({
        category: normalizeCategoryKey(category),
        sources
      });
    }
  }
  return plan;
}

export { DEFAULT_FEED_SOURCE_REGISTRY };
