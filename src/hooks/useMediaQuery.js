import { useState, useEffect, useSyncExternalStore } from 'react';

const DEV_MOBILE_VIEW_KEY = 'dailyEventAI_dev_mobile_view';
const DEV_MOBILE_VIEW_EVENT = 'daily-event-ai:dev-mobile-view-change';

function isDevMode() {
    return import.meta.env.DEV;
}

function getDevMobileViewSnapshot() {
    if (!isDevMode() || typeof window === 'undefined') return false;
    return localStorage.getItem(DEV_MOBILE_VIEW_KEY) === '1';
}

export function isDevMobileViewForced() {
    return getDevMobileViewSnapshot();
}

function subscribeDevMobileView(callback) {
    if (!isDevMode() || typeof window === 'undefined') {
        return () => {};
    }

    const handler = (event) => {
        if (event.type === 'storage' && event.key !== DEV_MOBILE_VIEW_KEY) return;
        callback();
    };

    window.addEventListener('storage', handler);
    window.addEventListener(DEV_MOBILE_VIEW_EVENT, handler);

    return () => {
        window.removeEventListener('storage', handler);
        window.removeEventListener(DEV_MOBILE_VIEW_EVENT, handler);
    };
}

export function setDevMobileViewOverride(enabled) {
    if (!isDevMode() || typeof window === 'undefined') return false;

    if (enabled) {
        localStorage.setItem(DEV_MOBILE_VIEW_KEY, '1');
    } else {
        localStorage.removeItem(DEV_MOBILE_VIEW_KEY);
    }

    window.dispatchEvent(new Event(DEV_MOBILE_VIEW_EVENT));
    return enabled;
}

export function toggleDevMobileViewOverride() {
    return setDevMobileViewOverride(!getDevMobileViewSnapshot());
}

/**
 * Custom hook for responsive design
 * Returns breakpoint information
 */
export function useMediaQuery() {
    // Initialize with safe defaults for SSR/initial render
    const [isDesktop, setIsDesktop] = useState(false);
    const [isTablet, setIsTablet] = useState(false);
    const [isWebView, setIsWebView] = useState(false);
    const [screenWidth, setScreenWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 0);
    const isDevMobileView = useSyncExternalStore(
        subscribeDevMobileView,
        getDevMobileViewSnapshot,
        getDevMobileViewSnapshot
    );

    useEffect(() => {
        // Function to update state based on window width
        const handleResize = () => {
            const width = window.innerWidth;
            setScreenWidth(width);
            const desktop = width >= 1024 && !isDevMobileView;
            const tablet = width >= 768 && width < 1024 && !isDevMobileView;

            setIsDesktop(desktop);
            setIsTablet(tablet);
            // We define "WebView" or "Desktop View" as effectively the same for this layout 
            // context - meaning a large screen that supports the sidebar layout.
            setIsWebView(desktop);

            console.log(`[Layout] Width: ${width}px, Mode: ${desktop ? 'desktop' : tablet ? 'tablet' : 'mobile'}`);
        };

        // Set initial values
        handleResize();

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isDevMobileView]);

    return { isDesktop, isTablet, isWebView, screenWidth, isDevMobileView };
}
