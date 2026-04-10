import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Header, { DataStatePill } from '../components/Header';
import { ImageCard } from '../components/ImageCard';
import { useWatchlist } from '../hooks/useWatchlist';
import { downloadCalendarEvent } from '../utils/calendar';
import {
    fetchStaticUpAheadData,
    fetchLiveUpAheadData,
    mergeUpAheadData,
    loadFromCache,
    saveToCache,
    clearUpAheadCache,
    isActualWeatherAlertText,
    isActualOfferText
} from '../services/upAheadService';
import plannerStorage from '../utils/plannerStorage';
import { useSettings } from '../context/SettingsContext';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import ProgressBar from '../components/ProgressBar';
import { shortenSourceLabel } from '../utils/storyMeta';
import { getRuntimeCapabilities } from '../runtime/runtimeCapabilities';
import './UpAhead.css';

function normalizePlanDate(dateStr) {
    if (!dateStr) return new Date().toISOString().slice(0, 10);

    const parsed = new Date(dateStr);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }

    return dateStr;
}

function UpAheadPage() {
    const { settings } = useSettings();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [loadingPhase, setLoadingPhase] = useState(0);
    const [view, setView] = useState('plan');
    const [, setBlacklist] = useState(plannerStorage.getBlacklist ? plannerStorage.getBlacklist() : new Set());
    const { toggleWatchlist, isWatched } = useWatchlist();

    const { pullDistance } = usePullToRefresh(() => {
        return loadData({ forceRefresh: true, liveOnly: true });
    });

    const buildCardArticle = (item) => ({
        ...item,
        time: formatConciseDate(item.date || item.releaseDate),
        summary: item.description || item.summary || '',
        source: item.source || item.platform || item.category || 'Up Ahead'
    });

    const loadData = useCallback(async ({ forceRefresh = false, liveOnly = false } = {}) => {
        const { isStaticHost } = getRuntimeCapabilities();

        if (!isStaticHost) {
            await plannerStorage.loadBlacklistFromApi?.();
            await plannerStorage.loadPlanFromApi?.();
        }

        if (forceRefresh) {
            if (liveOnly) {
                clearUpAheadCache();
                setData(null);
                setLoading(true);
                setLoadingPhase(0);
            }
            setIsRefreshing(true);
            setLoadingPhase(1);
        } else {
            setLoading(true);
            setLoadingPhase(0);
        }

        if (!forceRefresh && !liveOnly) {
            const cached = loadFromCache(settings.upAhead);
            if (cached) {
                setData(cached);
                setLoading(false);
                setLoadingPhase(1);
            }
        }

        if (!liveOnly) {
            try {
                const staticData = await fetchStaticUpAheadData(settings.upAhead);
                if (staticData) {
                    setData(prev => {
                        const merged = mergeUpAheadData(prev, staticData, settings.upAhead);
                        saveToCache(merged, settings.upAhead);
                        return merged;
                    });
                    if (!forceRefresh) setLoadingPhase(2);
                    setLoading(false);
                }
            } catch (e) {
                console.warn('Static fetch failed', e);
            }
        }

        setIsRefreshing(true);
        try {
            const upAheadSettings = settings.upAhead || {
                categories: { movies: true, events: true, festivals: true, alerts: true, sports: true, shopping: true, civic: true, weather_alerts: true, airlines: true },
                locations: ['Chennai']
            };

            const liveData = await fetchLiveUpAheadData(upAheadSettings);

            setData(prev => {
                const merged = mergeUpAheadData(liveOnly ? null : prev, liveData, settings.upAhead);
                saveToCache(merged, settings.upAhead);
                return merged;
            });
            setLoadingPhase(3);
        } catch (err) {
            console.error('Failed to load Live Up Ahead data', err);
        } finally {
            setIsRefreshing(false);
            setLoading(false);
        }
    }, [settings.upAhead]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleRemoveFromPlan = (item) => {
        const id = item?.hiddenKey || item?.canonicalId || item?.id;
        if (!id) return;
        if (plannerStorage.addToBlacklist) {
            plannerStorage.addToBlacklist(id);
            setBlacklist(plannerStorage.getBlacklist());
            loadData();
        }
    };

    const handleAddToPlan = (item, dateStr) => {
        const hiddenKey = item.hiddenKey || item.canonicalId || item.id;
        const normalizedDate = item.planDate || normalizePlanDate(dateStr);

        plannerStorage.addItem(normalizedDate, {
            id: hiddenKey || item.id,
            hiddenKey,
            title: item.title,
            category: item.tags?.[0] || 'event',
            type: item.type || item.tags?.[0] || 'event',
            link: item.link,
            description: item.description,
            icon: item.icon,
            planDate: normalizedDate,
            eventDateKey: normalizedDate,
            eventDate: normalizedDate
        });
        loadData();
        alert('Added to Plan!');
    };

    const formatConciseDate = (dateStr) => {
        if (!dateStr) return 'Coming Soon';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        const dayNum = d.getDate().toString().padStart(2, '0');
        const month = d.toLocaleDateString('en-US', { month: 'short' });
        return `${dayName}, ${dayNum} ${month}`;
    };

    const GridSection = ({ items, colorClass, emptyMessage, isOffer = false }) => {
        if (!items || items.length === 0) return <div className="empty-state"><p>{emptyMessage}</p></div>;
        return (
            <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                {items.map((item, i) => (
                    <div key={i} className="modern-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className={`ua-badge ${colorClass}`}>{formatConciseDate(item.date || item.releaseDate)}</div>
                            {isOffer && <span style={{ fontSize: '1.2rem' }}>🏷️</span>}
                        </div>
                        <h3 className="modern-card__title" style={{ marginTop: '8px' }}>{item.title}</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '8px 0', flex: 1 }}>
                            {item.description || 'No description available.'}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                             <a href={item.link} target="_blank" rel="noopener noreferrer" className="ua-source-link">Details ↗</a>
                             <button className="ua-cal-btn" onClick={() => handleAddToPlan(item, item.date || item.releaseDate)}>+ Plan</button>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderEntertainmentStyleGrid = (items, emptyMessage) => {
        if (!items || items.length === 0) {
            return <div className="empty-state"><p>{emptyMessage}</p></div>;
        }

        return (
            <div className="masonry-grid">
                {items.map((item, idx) => (
                    <ImageCard
                        key={item.id || idx}
                        article={buildCardArticle(item)}
                        href={item.link}
                        badge={shortenSourceLabel(item.source || item.platform || 'Up Ahead')}
                        size="medium"
                    />
                ))}
            </div>
        );
    };

    if (loading && !data) {
        return (
            <div className="page-container">
                <Header title="Up Ahead" icon="🗓️" loadingPhase={loadingPhase} />
                <div className="loading">
                    <div className="loading__spinner"></div>
                    <p>Scanning horizon...</p>
                </div>
            </div>
        );
    }

    if (!data || !data.timeline || data.timeline.length === 0) {
         return (
            <div className="page-container">
                <Header title="Up Ahead" icon="🗓️" loadingPhase={loadingPhase} />
                <div className="empty-state">
                    <span style={{ fontSize: '3rem' }}>🔭</span>
                    <h3>Nothing on the radar</h3>
                    <p>No upcoming events found.</p>
                    <button onClick={() => loadData({ forceRefresh: true, liveOnly: true })} className="btn btn--primary" style={{ marginTop: '1rem' }}>Force Refresh</button>
                    <div style={{ marginTop: '0.75rem' }}><small>Try adding more locations or categories in <Link to="/settings" style={{ color: 'var(--accent-primary)' }}>Settings</Link>.</small></div>
                </div>
            </div>
        );
    }

    const weatherAlerts = (data.sections?.weather_alerts || []).filter(item =>
        isActualWeatherAlertText(`${item?.title || ''} ${item?.description || ''}`, settings.upAhead)
    );
    const generalAlerts = data.sections?.alerts || [];
    const civicAlerts = data.sections?.civic || [];
    const combinedAlerts = [...weatherAlerts, ...generalAlerts, ...civicAlerts];

    const highPriorityAlert = weatherAlerts[0] || generalAlerts[0] || null;
    const alertIcon = weatherAlerts.length > 0 ? '🌪️' : '⚠️';
    const alertTitle = weatherAlerts.length > 0 ? 'Weather Warning' : 'Worth Knowing';
    const offerItems = [...(data.sections?.shopping || []), ...(data.sections?.airlines || [])].filter(item =>
        isActualOfferText(`${item?.title || ''} ${item?.description || ''}`, settings.upAhead)
    );
    const movieCards = (data.sections?.movies || []).map(buildCardArticle);
    const festivalCards = (data.sections?.festivals || []).map(buildCardArticle);

    const { isStaticHost } = getRuntimeCapabilities();
    const modeStr = isStaticHost ? (data?.sourceMode === 'snapshot' ? 'snapshot' : 'degraded') : (data?.sourceMode === 'cache' ? 'cached' : 'live');
    const modeLabel = isStaticHost ? (data?.sourceMode === 'snapshot' ? 'Snapshot' : 'Limited') : (data?.sourceMode === 'cache' ? 'Cached' : 'Live');

    const rightElementUI = (
        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            {isRefreshing && <div className="scanning-indicator" style={{fontSize:'0.7rem', color:'var(--accent-primary)'}}>Scanning...</div>}
            {data && <DataStatePill mode={modeStr} label={modeLabel} />}
        </div>
    );

    return (
        <div className="page-container up-ahead-page">
            <div style={{
                height: `${pullDistance}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                background: 'var(--bg-secondary)',
                color: 'var(--accent-primary)',
                fontSize: '0.8rem',
                transition: pullDistance === 0 ? 'height 0.3s ease' : 'none'
            }}>
                {pullDistance > 40 ? 'Release to refresh' : 'Pull to refresh'}
            </div>
            <Header
                title="Up Ahead"
                icon="🗓️"
                loadingPhase={loadingPhase}
                actions={rightElementUI}
            />

            <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', padding: '6px', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                {isRefreshing ? (
                    <>
                        <div className="loading__spinner" style={{width:'12px', height:'12px', borderWidth:'2px'}}></div>
                        <span>Scanning horizon...</span>
                    </>
                ) : (
                    <>
                        <span>Live Feed • {settings.upAhead?.locations?.join(', ') || 'All Locations'}</span>
                        <button onClick={() => loadData({ forceRefresh: true })} style={{background:'none', border:'none', cursor:'pointer', fontSize:'0.8rem'}} title="Refresh using cached and static data first">🔄</button>
                        <button onClick={() => loadData({ forceRefresh: true, liveOnly: true })} className="btn btn--secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }} title="Clear stale Up Ahead cache and reload from live feeds only">Force Refresh</button>
                    </>
                )}
            </div>

            {highPriorityAlert && (
                <div className={`ua-alert-banner ${weatherAlerts.length > 0 ? 'weather-alert' : ''}`}>
                    <span className="ua-alert-icon">{alertIcon}</span>
                    <div className="ua-alert-content">
                        <h4>{alertTitle}</h4>
                        <p>{highPriorityAlert.text}</p>
                    </div>
                </div>
            )}

            <main className="main-content">
                <div className="ua-view-toggle scrollable-tabs">
                    <button className={`ua-toggle-btn ${view === 'plan' ? 'active' : ''}`} onClick={() => setView('plan')}>Plan My Week</button>
                    <button className={`ua-toggle-btn ${view === 'offers' ? 'active' : ''}`} onClick={() => setView('offers')}>Offers</button>
                    <button className={`ua-toggle-btn ${view === 'movies' ? 'active' : ''}`} onClick={() => setView('movies')}>Releasing Soon</button>
                    <button className={`ua-toggle-btn ${view === 'events' ? 'active' : ''}`} onClick={() => setView('events')}>Upcoming Events</button>
                    <button className={`ua-toggle-btn ${view === 'alerts' ? 'active' : ''}`} onClick={() => setView('alerts')}>Alerts</button>
                    <button className={`ua-toggle-btn ${view === 'festivals' ? 'active' : ''}`} onClick={() => setView('festivals')}>Festivals</button>
                    <button className={`ua-toggle-btn ${view === 'feed' ? 'active' : ''}`} onClick={() => setView('feed')}>Timeline</button>
                </div>

                {view === 'plan' && (
                    <div className="ua-weekly-plan">
                         <ProgressBar active={loading || isRefreshing} style={{ marginBottom: '10px', borderRadius: '4px' }} />
                         {(data.weekly_plan && Array.isArray(data.weekly_plan)) ? data.weekly_plan.map((dayData, dIdx) => (
                             <div key={dIdx} className="modern-card" style={{ marginBottom: '16px' }}>
                                 <div className="modern-card__header" style={{ paddingBottom: '0', borderBottom: 'none' }}>
                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div className="ua-plan-ribbon" style={{ borderRadius: '8px' }}>
                                            <div style={{fontSize: '0.95rem', fontWeight: 800, whiteSpace: 'nowrap'}}>
                                                {dayData.day}
                                            </div>
                                        </div>
                                        <span style={{opacity: 0.8, fontWeight: 500, color: 'var(--text-muted)'}}>{dayData.date}</span>
                                     </div>
                                 </div>
                                 <div className="ua-plan-day-content" style={{ border: 'none', padding: '8px 0 0 0', background: 'transparent' }}>
                                     {dayData.items && dayData.items.length > 0 ? (
                                         dayData.items.map((item, idx) => (
                                             <div key={idx} className="ua-plan-event-item" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                                                  <button className="ua-plan-delete-btn" onClick={(e) => { e.preventDefault(); handleRemoveFromPlan(item); }} aria-label="Remove event" style={{background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:'0.9rem', padding: '0 8px 0 0'}}>✕</button>
                                                 <a href={item.link} target="_blank" rel="noopener noreferrer" style={{flex:1, display:'flex', alignItems:'center', gap:'10px', textDecoration:'none', color:'inherit'}}>
                                                     <span className="ua-event-icon">{item.icon}</span>
                                                     <div style={{display:'flex', flexDirection:'column'}}>
                                                         <span className="ua-event-title">{item.title}</span>
                                                         {item.isOffer && <span className="ua-offer-badge">🛒 Ends Today</span>}
                                                     </div>
                                                 </a>
                                                 <div style={{display:'flex', gap:'8px'}}>
                                                     <button className="ua-plan-action-btn" onClick={(e) => { e.preventDefault(); downloadCalendarEvent(item.title, item.description || item.title); }} title="Add to Calendar" style={{background:'none', border:'none', cursor:'pointer', fontSize:'1.1rem'}}>📅</button>
                                                 </div>
                                             </div>
                                         ))
                                     ) : <span className="ua-plan-empty" style={{padding: '10px', color: 'var(--text-muted)', fontSize: '0.9rem'}}>-</span>}
                                 </div>
                             </div>
                         )) : <div style={{textAlign:'center', padding:'20px'}}>Data unavailable.</div>}
                    </div>
                )}

                {view === 'movies' && <div className="ua-tab-view"><ProgressBar active={loading || isRefreshing} />{renderEntertainmentStyleGrid(movieCards, 'No upcoming movie releases found.')}</div>}
                {view === 'offers' && <div className="ua-tab-view"><ProgressBar active={loading || isRefreshing} /><GridSection items={offerItems} colorClass="type-shopping" emptyMessage="No offers found." isOffer={true} /></div>}
                {view === 'events' && <div className="ua-tab-view"><ProgressBar active={loading || isRefreshing} /><GridSection items={[...(data.sections?.events || []), ...(data.sections?.sports || [])]} colorClass="type-event" emptyMessage="No upcoming events found." /></div>}
                {view === 'alerts' && <div className="ua-tab-view"><ProgressBar active={loading || isRefreshing} /><GridSection items={combinedAlerts} colorClass="type-alert" emptyMessage="No alerts found." /></div>}
                {view === 'festivals' && <div className="ua-tab-view"><ProgressBar active={loading || isRefreshing} />{renderEntertainmentStyleGrid(festivalCards, 'No festivals found.')}</div>}

                {view === 'feed' && (
                    <div className="ua-timeline">
                        {data.timeline.map((day) => (
                            <div key={day.date} className="ua-day-section timeline-track">
                                <div className="ua-day-header">
                                    <div className="ua-day-label">{day.dayLabel}</div>
                                    <div className="ua-date-sub">{day.date}</div>
                                </div>
                                {day.items?.map(item => (
                                    <div key={item.id} className="timeline-card" style={{ marginBottom: '16px' }}>
                                        <div className="ua-media-content" style={{ padding: 0 }}>
                                            <div className="ua-media-header">
                                                <span className={`ua-badge type-${item.type}`}>{item.type.toUpperCase()}</span>
                                                <button className={`ua-watch-btn ${isWatched(item.id) ? 'active' : ''}`} onClick={() => toggleWatchlist(item.id)}>{isWatched(item.id) ? '★' : '☆'}</button>
                                            </div>
                                            <h3 className="ua-media-title">{item.title}</h3>
                                            <p className="ua-media-desc">{item.description ? (item.description.length > 100 ? item.description.substring(0, 100) + '...' : item.description) : ''}</p>
                                            <div className="ua-media-footer">
                                                {item.link && <a href={item.link} target="_blank" rel="noopener noreferrer" className="ua-source-link">Read Source ↗</a>}
                                                <button className="ua-cal-btn" onClick={() => handleAddToPlan(item, day.date)} title="Add to Plan My Week">📌 Plan</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}

export default UpAheadPage;
