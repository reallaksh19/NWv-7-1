import { DEFAULT_SETTINGS } from '../utils/storage.js';
import { annotateItemSourceTrust } from './sourceTrust.js';

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function countMatches(text, keywords = []) {
  const lower = normalizeText(text);
  let count = 0;
  for (const keyword of keywords || []) {
    const normalized = String(keyword || '').trim().toLowerCase();
    if (!normalized) continue;
    if (normalized.includes(' ')) {
      if (lower.includes(normalized)) count += 1;
    } else {
      const re = new RegExp(`\\b${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(lower)) count += 1;
    }
  }
  return count;
}

function keywordSets(settings) {
  return settings?.upAhead?.keywords || DEFAULT_SETTINGS.upAhead.keywords;
}

function categoryList() {
  return ['movies', 'events', 'festivals', 'alerts', 'sports', 'shopping', 'civic', 'weather_alerts', 'airlines'];
}

function categoryAliases() {
  return {
    movie: 'movies',
    event: 'events',
    festival: 'festivals',
    alert: 'alerts',
    weather_alert: 'weather_alerts',
    airline_offer: 'airlines',
    offer: 'shopping',
    shopping: 'shopping'
  };
}

function detectBySourceType(sourceType) {
  const map = {
    airline: 'airlines',
    cinema: 'movies',
    event_listing: 'events',
    government: 'alerts',
    commerce: 'shopping'
  };
  return map[sourceType] || null;
}

export function classifyItemCategory(item, options = {}) {
  const settings = options.settings || DEFAULT_SETTINGS;
  const itemWithTrust = annotateItemSourceTrust(item, options.sourceTrustOptions || {});
  const text = `${item?.title || ''} ${item?.description || ''} ${item?.summary || ''}`;
  const keywords = keywordSets(settings);
  const aliases = categoryAliases();
  const decisionTrace = [...(itemWithTrust.decisionTrace || [])];

  const explicitCategory = aliases[String(item?.category || '').toLowerCase()] || String(item?.category || '').toLowerCase() || null;
  if (explicitCategory && categoryList().includes(explicitCategory)) {
    decisionTrace.push(`category_hint:${explicitCategory}`);
  }

  let best = { category: explicitCategory || 'general', score: explicitCategory ? 1.5 : 0 };

  for (const category of categoryList()) {
    const positive = countMatches(text, keywords[category] || []);
    const negative = countMatches(text, keywords[`${category}_negative`] || []) + countMatches(text, keywords.negative || []);
    let score = positive * 1.0 - negative * 0.85;

    if (detectBySourceType(itemWithTrust.sourceType) === category) {
      score += 0.9;
    }
    if (explicitCategory === category) {
      score += 0.6;
    }
    if (category === 'weather_alerts' && itemWithTrust.sourceType === 'government') {
      score += 0.3;
    }
    if (category === 'airlines' && itemWithTrust.sourceType === 'airline') {
      score += 0.4;
    }

    if (score > best.score) {
      best = { category, score };
    }
  }

  const classificationConfidence = Math.max(0, Math.min(1, best.score <= 0 ? 0 : best.score / 4));
  if (best.category !== 'general') {
    decisionTrace.push(`classified:${best.category}`);
  } else {
    decisionTrace.push('classified:general');
  }

  return {
    ...itemWithTrust,
    category: best.category,
    classificationConfidence,
    decisionTrace
  };
}

export function annotateItemsWithClassification(items = [], options = {}) {
  return (items || []).map(item => classifyItemCategory(item, options));
}
