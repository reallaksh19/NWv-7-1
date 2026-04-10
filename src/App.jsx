import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import MainPage from './pages/MainPage';
import UpAheadPage from './pages/UpAheadPage';
import MyPlannerPage from './pages/MyPlannerPage';
import WeatherPage from './pages/WeatherPage';
import MarketPage from './pages/MarketPage';
import TechSocialPage from './pages/TechSocialPage';
import NewspaperPage from './pages/NewspaperPage';
import SettingsPage from './pages/SettingsPage';
import RefreshPage from './pages/RefreshPage';
import FollowingPage from './pages/FollowingPage';
import TopicDetail from './pages/TopicDetail';
import MorePage from './pages/MorePage';
import BottomNav from './components/BottomNav';
import ScrollToTop from './components/ScrollToTop';
import DebugConsole from './components/DebugConsole';
import { WeatherProvider, useWeather } from './context/WeatherContext';
import { NewsProvider, useNews } from './context/NewsContext';
import { MarketProvider } from './context/MarketContext';
import { SettingsProvider } from './context/SettingsContext';
import { SegmentProvider } from './context/SegmentContext';
import { TopicProvider } from './context/TopicContext';
import './index.css';

/**
 * Global Progress Bar
 * "Deep Architect Mode" - High visibility, smooth animation, top of screen.
 */
const GlobalLoader = () => {
  const { loading: newsLoading } = useNews();
  const { loading: weatherLoading } = useWeather();
  const isLoading = newsLoading || weatherLoading;
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer;
    if (isLoading) {
      setVisible(true);
      setProgress(10); // Start
      // Simulated progress to make it feel responsive
      timer = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return prev;
          // Decelerating increment
          const increment = Math.max(1, (90 - prev) / 10);
          return prev + increment;
        });
      }, 200);
    } else {
      setProgress(100);
      setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 400); // Fade out after completion
    }
    return () => clearInterval(timer);
  }, [isLoading]);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: '3px',
      zIndex: 100000,
      pointerEvents: 'none'
    }}>
      <div style={{
        height: '100%',
        width: `${progress}%`,
        background: 'linear-gradient(90deg, #00D4AA, #58A6FF, #F0883E)',
        boxShadow: '0 0 10px rgba(0, 212, 170, 0.5)',
        transition: 'width 0.2s ease-out',
        borderRadius: '0 2px 2px 0'
      }} />
    </div>
  );
};

function App() {
  console.log('[App] Rendering root component...');
  return (
    <SettingsProvider>
      <SegmentProvider>
        <WeatherProvider lazy={true}>
          <NewsProvider>
            <MarketProvider>
              <TopicProvider>
                <HashRouter>
                <ScrollToTop />
                <GlobalLoader />
                <DebugConsole />
                <div className="app">
                  <Routes>
                    <Route path="/" element={<MainPage />} />
                    <Route path="/up-ahead" element={<UpAheadPage />} />
                    <Route path="/my-planner" element={<MyPlannerPage />} />
                    <Route path="/more" element={<MorePage />} />
                    <Route path="/weather" element={<WeatherPage />} />
                    <Route path="/markets" element={<MarketPage />} />
                    <Route path="/tech-social" element={<TechSocialPage />} />
                    <Route path="/newspaper" element={<NewspaperPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/refresh" element={<RefreshPage />} />
                    <Route path="/following" element={<FollowingPage />} />
                    <Route path="/following/:topicId" element={<TopicDetail />} />
                  </Routes>
                  <BottomNav />
                </div>
                </HashRouter>
              </TopicProvider>
            </MarketProvider>
          </NewsProvider>
        </WeatherProvider>
      </SegmentProvider>
    </SettingsProvider>
  );
}

export default App;
