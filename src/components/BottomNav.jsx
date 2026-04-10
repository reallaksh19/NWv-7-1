import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useMediaQuery } from '../hooks/useMediaQuery';

function BottomNav() {
    const { isWebView } = useMediaQuery();
    const location = useLocation();

    const navItems = [
        { path: '/', label: 'Main', icon: '🏠' },
        { path: '/up-ahead', label: 'Up Ahead', icon: '🗓️' },
        { path: '/my-planner', label: 'Planner', icon: '📌' },
        { path: '/following', label: 'Follow', icon: '🧭' },
        { path: '/more', label: 'More', icon: '⋯' }
    ];

    return (
        <nav className={`bottom-nav ${isWebView ? 'bottom-nav--desktop' : ''}`}>
            {navItems.map(item => (
                <NavLink
                    key={item.path}
                    to={item.path}
                    className={`bottom-nav__item ${location.pathname === item.path ? 'active' : ''}`}
                    title={item.label} // Accessibility/Tooltip
                >
                    <span className="bottom-nav__icon">{item.icon}</span>
                    <span className="bottom-nav__label">{item.label}</span>
                </NavLink>
            ))}
        </nav>
    );
}

export default BottomNav;
