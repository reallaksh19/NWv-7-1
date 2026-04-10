/**
 * Multi-Model Weather Service
 * Static-host safe: prefer cached weather on GitHub Pages instead of hammering live APIs
 */
import {
    calculateRainfallConsensus,
    averageTemperature,
    averageApparentTemperature,
    getMostCommonWeatherCode,
    averagePrecipitation,
    getSuccessfulModels,
    formatModelNames
} from '../utils/multiModelUtils.js';
import { getSettings } from '../utils/storage.js';
import logStore from '../utils/logStore.js';
import { getWeatherIconId } from '../utils/weatherUtils.js';
import { getRuntimeCapabilities } from "../runtime/runtimeCapabilities.js";

const MODELS = {
    ecmwf: 'https://api.open-meteo.com/v1/ecmwf',
    gfs: 'https://api.open-meteo.com/v1/gfs',
    icon: 'https://api.open-meteo.com/v1/dwd-icon'
};

const LOCATIONS = {
    chennai: { lat: 13.0827, lon: 80.2707 },
    trichy: { lat: 10.7905, lon: 78.7047 },
    muscat: { lat: 23.5859, lon: 58.4059 }
};

const WEATHER_CACHE_PREFIX = 'weather_cache_';
const WEATHER_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

function isStaticHostRuntime() { return getRuntimeCapabilities().isStaticHost; }

async function fetchWeatherSnapshot(locationKey) {
  try {
    const resp = await fetch('/data/weather_snapshot.json');
    if (!resp.ok) return null;
    const snapshot = await resp.json();
    return snapshot?.[locationKey] || null;
  } catch {
    return null;
  }
}

function readCachedWeather(locationKey, allowStale = true) {
    try {
        const raw = localStorage.getItem(`${WEATHER_CACHE_PREFIX}${locationKey}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const age = Date.now() - (parsed?.fetchedAt || 0);
        if (!allowStale && age > WEATHER_CACHE_TTL_MS) return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeCachedWeather(locationKey, payload) {
    try {
        localStorage.setItem(`${WEATHER_CACHE_PREFIX}${locationKey}`, JSON.stringify(payload));
    } catch {
        // ignore
    }
}

async function resolveLocation(cityName) {
    const key = cityName.toLowerCase();
    if (LOCATIONS[key]) return LOCATIONS[key];
    try {
        const cache = JSON.parse(localStorage.getItem('weather_geo_cache') || '{}');
        if (cache[key]) return cache[key];
    } catch {
        // ignore
    }

    if (isStaticHostRuntime()) {
        throw new Error(`Location not found in static-host mode: ${cityName}`);
    }

    const resp = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`);
    const data = await resp.json();
    if (data.results && data.results.length > 0) {
        const loc = { lat: data.results[0].latitude, lon: data.results[0].longitude };
        try {
            const cache = JSON.parse(localStorage.getItem('weather_geo_cache') || '{}');
            cache[key] = loc;
            localStorage.setItem('weather_geo_cache', JSON.stringify(cache));
        } catch {
            // ignore
        }
        return loc;
    }
    throw new Error(`Location not found: ${cityName}`);
}

async function fetchSingleModel(modelName, lat, lon) {
    const baseUrl = MODELS[modelName];
    if (!baseUrl) throw new Error(`Unknown model: ${modelName}`);
    const params = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        current: 'temperature_2m,weather_code,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m',
        hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,uv_index,cloud_cover,visibility,dew_point_2m',
        daily: 'precipitation_probability_max,precipitation_sum,uv_index_max,temperature_2m_max,temperature_2m_min',
        timezone: 'auto'
    });
    const response = await fetch(`${baseUrl}?${params}`);
    if (!response.ok) throw new Error(`${modelName.toUpperCase()} API request failed: ${response.status}`);
    return response.json();
}

export async function fetchWeather(locationKey) {
    const _t0 = Date.now();
    const cacheFresh = readCachedWeather(locationKey, false);
    if (cacheFresh) return { ...cacheFresh, sourceMode: 'live' };

    if (isStaticHostRuntime()) {
        const cached = readCachedWeather(locationKey, true);
        if (cached) return { ...cached, sourceMode: 'cache' };

        const snapshot = await fetchWeatherSnapshot(locationKey);
        if (snapshot) return { ...snapshot, sourceMode: 'snapshot' };

        return null;
    }

    let lat, lon;
    try {
        const coords = await resolveLocation(locationKey);
        lat = coords.lat;
        lon = coords.lon;
    } catch (e) {
        const cached = readCachedWeather(locationKey, true);
        if (cached) return cached;
        throw new Error(`Unknown location: ${locationKey}`);
    }

    const settings = getSettings();
    const modelSettings = settings.weather?.models || { ecmwf: true, gfs: true, icon: true };
    const enabledModelNames = Object.keys(MODELS).filter(m => modelSettings[m] !== false);
    if (enabledModelNames.length === 0) enabledModelNames.push('ecmwf', 'gfs', 'icon');

    try {
        const results = await Promise.allSettled(enabledModelNames.map(model => fetchSingleModel(model, lat, lon)));
        const modelData = {};
        enabledModelNames.forEach((modelName, index) => {
            modelData[modelName] = results[index].status === 'fulfilled' ? results[index].value : null;
        });

        const successfulModels = getSuccessfulModels(modelData);
        if (successfulModels.length === 0) throw new Error('All weather models failed to fetch data');

        const processed = processMultiModelData(modelData, locationKey);
        writeCachedWeather(locationKey, processed);
        logStore.success('weather', `${locationKey}: ${successfulModels.length}/${enabledModelNames.length} models OK`, { durationMs: Date.now() - _t0 });
        return processed;
    } catch (error) {
        const cached = readCachedWeather(locationKey, true);
        if (cached) {
            return { ...cached, isStale: true };
        }
        logStore.error('weather', `${locationKey}: ${error.message}`, { durationMs: Date.now() - _t0 });
        throw error;
    }
}

function processMultiModelData(modelData, locationName) {
    const currentData = [modelData.ecmwf?.current, modelData.gfs?.current, modelData.icon?.current].filter(Boolean);
    const getIconForHour = (code, hour) => getWeatherIconId(code, hour ?? new Date().getHours());
    const getIcon = (code) => { if (code <= 1) return '☀️'; if (code <= 3) return '⛅'; if (code <= 67) return '🌧️'; if (code <= 99) return '⛈️'; return '❓'; };
    const conditionMap = { 0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Light Drizzle', 61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain', 80: 'Rain Showers', 95: 'Thunderstorm' };
    const getCondition = (code) => conditionMap[code] || 'Unknown';

    const getSegmentMetrics = (startHour, endHour) => {
        const indices = [];
        for (let i = startHour; i <= endHour; i++) indices.push(i);
        const allModelHourlyData = [];
        if (modelData.ecmwf?.hourly) allModelHourlyData.push(modelData.ecmwf.hourly);
        if (modelData.gfs?.hourly) allModelHourlyData.push(modelData.gfs.hourly);
        if (modelData.icon?.hourly) allModelHourlyData.push(modelData.icon.hourly);

        const segmentTemps = []; const segmentApparent = []; const segmentPrecip = []; const segmentPrecipProb = []; const segmentWeatherCodes = []; const segmentHumidity = []; const segmentWindSpeed = []; const segmentUV = []; const segmentCloud = [];

        indices.forEach(hourIdx => {
            const hourData = allModelHourlyData.map(hourly => ({
                temperature_2m: hourly.temperature_2m?.[hourIdx],
                apparent_temperature: hourly.apparent_temperature?.[hourIdx],
                precipitation: hourly.precipitation?.[hourIdx],
                precipitation_probability: hourly.precipitation_probability?.[hourIdx],
                weather_code: hourly.weather_code?.[hourIdx],
                relative_humidity_2m: hourly.relative_humidity_2m?.[hourIdx],
                wind_speed_10m: hourly.wind_speed_10m?.[hourIdx],
                uv_index: hourly.uv_index?.[hourIdx],
                cloud_cover: hourly.cloud_cover?.[hourIdx]
            }));
            const avgTemp = averageTemperature(hourData);
            const avgApparent = averageApparentTemperature(hourData);
            const avgPrecip = averagePrecipitation(hourData);
            const weatherCode = getMostCommonWeatherCode(hourData);
            if (avgTemp !== null) segmentTemps.push(avgTemp);
            if (avgApparent !== null) segmentApparent.push(avgApparent);
            if (avgPrecip !== null) segmentPrecip.push(avgPrecip);
            if (weatherCode !== null) segmentWeatherCodes.push(weatherCode);
            hourData.forEach(d => {
                if (d.precipitation_probability != null) segmentPrecipProb.push({ precipitation_probability: d.precipitation_probability });
                if (d.relative_humidity_2m != null) segmentHumidity.push(d.relative_humidity_2m);
                if (d.wind_speed_10m != null) segmentWindSpeed.push(d.wind_speed_10m);
                if (d.uv_index != null) segmentUV.push(d.uv_index);
                if (d.cloud_cover != null) segmentCloud.push(d.cloud_cover);
            });
        });

        const avgTemp = segmentTemps.length ? Math.round(segmentTemps.reduce((a, b) => a + b, 0) / segmentTemps.length) : null;
        const feelsLike = segmentApparent.length ? Math.round(segmentApparent.reduce((a, b) => a + b, 0) / segmentApparent.length) : avgTemp;
        const totalRainVal = segmentPrecip.reduce((a, b) => a + b, 0);
        const rainfallConsensus = calculateRainfallConsensus(segmentPrecipProb);
        const midCode = segmentWeatherCodes.length ? segmentWeatherCodes[Math.floor(segmentWeatherCodes.length / 2)] : 0;
        const midHour = Math.floor((startHour + endHour) / 2) % 24;

        return {
            temp: avgTemp,
            feelsLike,
            icon: getIcon(midCode),
            iconId: getIconForHour(midCode, midHour),
            rainMm: totalRainVal < 1.0 ? '-' : `${totalRainVal.toFixed(1)}mm`,
            rainProb: rainfallConsensus || { avg: 0, min: 0, max: 0, displayString: '~0%', isWideRange: false },
            humidity: segmentHumidity.length ? Math.round(segmentHumidity.reduce((a, b) => a + b, 0) / segmentHumidity.length) : null,
            windSpeed: segmentWindSpeed.length ? Math.round(segmentWindSpeed.reduce((a, b) => a + b, 0) / segmentWindSpeed.length) : null,
            uvIndex: segmentUV.length ? Math.max(...segmentUV) : null,
            cloudCover: segmentCloud.length ? Math.round(segmentCloud.reduce((a, b) => a + b, 0) / segmentCloud.length) : null,
            hourly: []
        };
    };

    const getDaySegments = (dayOffset) => {
        const offset = dayOffset * 24;
        return { morning: getSegmentMetrics(6 + offset, 11 + offset), noon: getSegmentMetrics(12 + offset, 16 + offset), evening: getSegmentMetrics(17 + offset, 22 + offset) };
    };

    const today = getDaySegments(0);
    const tomorrow = getDaySegments(1);
    const currentTemp = averageTemperature(currentData);
    const currentFeelsLike = averageApparentTemperature(currentData);
    const currentWeatherCode = getMostCommonWeatherCode(currentData);
    const currentHumidity = currentData.length && currentData[0].relative_humidity_2m != null ? Math.round(currentData.reduce((sum, d) => sum + (d.relative_humidity_2m || 0), 0) / currentData.length) : null;
    const currentWindSpeed = currentData.length && currentData[0].wind_speed_10m != null ? Math.round(currentData.reduce((sum, d) => sum + (d.wind_speed_10m || 0), 0) / currentData.length) : null;
    const currentWindDirection = currentData.length && currentData[0].wind_direction_10m != null ? Math.round(currentData.reduce((sum, d) => sum + (d.wind_direction_10m || 0), 0) / currentData.length) : null;
    const dailyMaxPrecipProb = [modelData.ecmwf?.daily?.precipitation_probability_max?.[0], modelData.gfs?.daily?.precipitation_probability_max?.[0], modelData.icon?.daily?.precipitation_probability_max?.[0]].filter(v => v != null);
    const maxPrecipProb = dailyMaxPrecipProb.length ? Math.round(dailyMaxPrecipProb.reduce((a, b) => a + b, 0) / dailyMaxPrecipProb.length) : 0;
    const dailyPrecipSum = [modelData.ecmwf?.daily?.precipitation_sum?.[0], modelData.gfs?.daily?.precipitation_sum?.[0], modelData.icon?.daily?.precipitation_sum?.[0]].filter(v => v != null);
    const totalPrecip = dailyPrecipSum.length ? (dailyPrecipSum.reduce((a, b) => a + b, 0) / dailyPrecipSum.length).toFixed(1) : '0.0';
    const dailyUVMax = [modelData.ecmwf?.daily?.uv_index_max?.[0], modelData.gfs?.daily?.uv_index_max?.[0], modelData.icon?.daily?.uv_index_max?.[0]].filter(v => v != null);
    const maxUV = dailyUVMax.length ? Math.round(dailyUVMax.reduce((a, b) => a + b, 0) / dailyUVMax.length) : null;
    const successfulModels = getSuccessfulModels(modelData);

    return {
        name: locationName.charAt(0).toUpperCase() + locationName.slice(1),
        icon: locationName === 'muscat' ? '📍' : '🏛️',
        fetchedAt: Date.now(),
        models: { successful: successfulModels, count: successfulModels.length, names: formatModelNames(successfulModels) },
        current: {
            temp: currentTemp,
            feelsLike: currentFeelsLike,
            high: null,
            low: null,
            condition: getCondition(currentWeatherCode),
            icon: getIcon(currentWeatherCode),
            iconId: getIconForHour(currentWeatherCode, new Date().getHours()),
            humidity: currentHumidity,
            windSpeed: currentWindSpeed,
            windDirection: currentWindDirection
        },
        morning: today.morning,
        noon: today.noon,
        evening: today.evening,
        tomorrow,
        hourly24: [],
        next8Hours: [],
        summary: parseFloat(totalPrecip) > 0 ? `Today's max rain probability: ${maxPrecipProb}%. Total precip: ${totalPrecip}mm. UV Index: ${maxUV || 'N/A'}.` : `Condition stable. UV Index: ${maxUV || 'N/A'}.`
    };
}
