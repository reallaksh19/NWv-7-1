import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchWeather } from '../services/weatherService';
import { getSettings } from '../utils/storage';
import { useSettings } from './SettingsContext';

const WeatherContext = createContext();

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function WeatherProvider({ children, lazy = false }) {
    const { settingsVersion } = useSettings();
    const prevVersion = useRef(settingsVersion);

    const [booted, setBooted] = useState(!lazy);
    const [weatherData, setWeatherData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastFetch, setLastFetch] = useState(0);

    const ensureBoot = useCallback(() => {
        setBooted(true);
    }, []);

    const loadWeather = useCallback(async (force = false) => {
        if (!booted) return;

        const settings = getSettings();
        const freshnessLimitMs = (settings?.weatherFreshnessLimit || 4) * 60 * 60 * 1000;

        if (!force && weatherData) {
            const age = Date.now() - lastFetch;
            if (age < 15 * 60 * 1000) {
                return;
            }
            if (settings?.strictFreshness && age > freshnessLimitMs) {
                setWeatherData(null);
            }
        }

        setLoading(true);

        if (settings?.sections?.weather === false) {
            setLoading(false);
            return;
        }

        try {
            const cities = settings?.weather?.cities || ['chennai', 'trichy', 'muscat'];
            const data = {};
            let successCount = 0;

            for (let i = 0; i < cities.length; i += 1) {
                const city = cities[i];
                try {
                    data[city] = await fetchWeather(city);
                    successCount += 1;
                } catch (cityError) {
                    console.warn(`[WeatherContext] ${city} failed:`, cityError?.message || cityError);
                    data[city] = weatherData?.[city] || null;
                }

                if (i < cities.length - 1) {
                    await delay(500);
                }
            }

            if (successCount === 0 && weatherData) {
                setError(new Error('Using previous cached weather data; live refresh failed.'));
                setLoading(false);
                return;
            }

            setWeatherData(data);
            setLastFetch(Date.now());
            setError(successCount === 0 ? new Error('All weather fetches failed') : null);
        } catch (err) {
            console.error('Weather Context Error:', err);
            setError(err);
            if (!weatherData) {
                setWeatherData(null);
            }
        } finally {
            setLoading(false);
        }
    }, [weatherData, lastFetch, booted]);

    useEffect(() => {
        if (!booted) return;
        loadWeather();
    }, [booted, loadWeather]);

    useEffect(() => {
        if (!booted) return;
        if (prevVersion.current !== settingsVersion) {
            prevVersion.current = settingsVersion;
            loadWeather(true);
        }
    }, [booted, settingsVersion, loadWeather]);

    return (
        <WeatherContext.Provider value={{ weatherData, loading, error, refreshWeather: loadWeather, ensureBoot }}>
            {children}
        </WeatherContext.Provider>
    );
}

export function useWeather() {
    return useContext(WeatherContext);
}
