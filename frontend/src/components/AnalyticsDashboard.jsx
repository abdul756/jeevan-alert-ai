import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import apiService from '../services/apiService';
import { useDarkMode } from '../context/DarkModeContext';
import jeevanAlertLogo from '../assets/jeevanalert.svg';

/**
 * Analytics Dashboard Component
 * Shows key metrics, trends, and AI usage statistics
 */
export default function AnalyticsDashboard() {
    const navigate = useNavigate();
    const location = useLocation();
    const { darkMode, toggleDarkMode } = useDarkMode();
    const [dashboardData, setDashboardData] = useState(null);
    const [encounterTrends, setEncounterTrends] = useState(null);
    const [aiStats, setAIStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(30);
    const [userName, setUserName] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(true);

    useEffect(() => {
        const staffId = localStorage.getItem('staffId');
        if (!staffId) {
            navigate('/');
            return;
        }
        const name = localStorage.getItem('userName') || 'CHW User';
        setUserName(name);
        loadDashboardData();
    }, []);

    useEffect(() => {
        loadDashboardData();
    }, [days]);

    const loadDashboardData = async () => {
        setLoading(true);
        try {
            const [dashboard, trends, ai] = await Promise.all([
                apiService.getDashboardData(days),
                apiService.getEncounterTrends(days),
                apiService.getAIUsageStats(days)
            ]);

            setDashboardData(dashboard);
            setEncounterTrends(trends);
            setAIStats(ai);
        } catch (error) {
            console.error('Failed to load dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.clear();
        navigate('/');
    };

    const isActive = (path) => location.pathname === path;

    const navLink = (to, icon, label, badge = null, badgeBg = null) => (
        <Link
            to={to}
            className="d-flex align-items-center gap-3 px-3 py-2 text-decoration-none rounded-3 mb-1"
            style={{
                background: isActive(to) ? 'rgba(20, 184, 166, 0.15)' : 'transparent',
                color: isActive(to) ? '#14B8A6' : 'rgba(255,255,255,0.7)',
                transition: 'all 0.2s ease',
                borderLeft: isActive(to) ? '3px solid #14B8A6' : '3px solid transparent',
                paddingLeft: '16px'
            }}
            onMouseEnter={(e) => {
                if (!isActive(to)) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                    e.currentTarget.style.color = 'white';
                }
            }}
            onMouseLeave={(e) => {
                if (!isActive(to)) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                }
            }}
        >
            <i className={`bi ${icon}`} style={{ fontSize: '1.1rem' }}></i>
            <span className="fw-medium flex-grow-1" style={{ fontSize: '0.95rem' }}>{label}</span>
            {badge && (
                <span className="badge" style={{
                    background: isActive(to) ? (badgeBg || 'rgba(20, 184, 166, 0.3)') : 'rgba(255,255,255,0.1)',
                    fontSize: '0.65rem',
                    padding: '3px 6px',
                    fontWeight: '600'
                }}>{badge}</span>
            )}
        </Link>
    );

    const triageData = encounterTrends?.triage_distribution || {};

    return (
        <div className="d-flex min-vh-100" style={{
            background: darkMode
                ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
                : 'linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 100%)'
        }}>
            {/* ====== SIDEBAR ====== */}
            <aside
                className={`d-flex flex-column ${sidebarOpen ? '' : 'd-none d-lg-flex'}`}
                style={{
                    width: '280px',
                    minWidth: '280px',
                    background: darkMode
                        ? 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)'
                        : 'linear-gradient(180deg, #1e293b 0%, #334155 100%)',
                    boxShadow: darkMode ? '4px 0 24px rgba(0,0,0,0.5)' : '4px 0 24px rgba(0,0,0,0.15)',
                    zIndex: 1000,
                    transition: 'all 0.3s ease',
                    borderRight: darkMode ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    position: 'sticky',
                    top: 0,
                    height: '100vh',
                    overflowY: 'auto',
                }}
            >
                {/* Logo */}
                <div className="p-4 border-bottom" style={{ borderColor: 'rgba(255,255,255,0.1) !important' }}>
                    <Link to="/dashboard" className="text-decoration-none d-flex justify-content-center">
                        <img src={jeevanAlertLogo} alt="JeevanAlert AI" style={{ width: '100%', maxWidth: '200px', height: 'auto', filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.25))' }} />
                    </Link>
                </div>

                {/* Navigation */}
                <nav className="flex-grow-1 py-3">
                    <div className="px-3 mb-2">
                        <span className="text-uppercase text-white-50 small fw-semibold" style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>Main Menu</span>
                    </div>

                    {navLink('/dashboard', 'bi-grid-1x2-fill', 'Dashboard')}
                    {navLink('/patients', 'bi-people-fill', 'Patients')}
                    {navLink('/charma-scan', 'bi-search', 'Charma Scan', 'AI', 'rgba(236, 72, 153, 0.3)')}
                    {navLink('/analytics', 'bi-bar-chart-line-fill', 'Analytics')}
                </nav>

                {/* User Profile & Logout */}
                <div className="p-3 border-top" style={{ borderColor: 'rgba(255,255,255,0.1) !important' }}>
                    <div className="d-flex align-items-center gap-3 p-2 rounded-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div
                            className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold"
                            style={{
                                width: '36px',
                                height: '36px',
                                background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
                                fontSize: '0.85rem'
                            }}
                        >
                            {userName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-grow-1 overflow-hidden">
                            <div className="text-white fw-medium small text-truncate">{userName}</div>
                            <div className="text-white-50" style={{ fontSize: '0.7rem' }}>Community Health Worker</div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="btn btn-link p-1 text-white-50"
                            title="Logout"
                            style={{ fontSize: '0.9rem' }}
                        >
                            <i className="bi bi-box-arrow-right"></i>
                        </button>
                    </div>
                </div>
            </aside>

            {/* ====== MAIN CONTENT ====== */}
            <main className="flex-grow-1 overflow-auto">
                {/* Top Bar */}
                <header
                    className="sticky-top"
                    style={{
                        background: darkMode ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.92)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        borderBottom: darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f1f5f9',
                        boxShadow: darkMode ? '0 1px 3px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.04)',
                        zIndex: 100,
                        transition: 'all 0.3s ease'
                    }}
                >
                    <div className="container-fluid py-3 px-4">
                        <div className="d-flex justify-content-between align-items-center">
                            <div className="d-flex align-items-center gap-3">
                                <button
                                    className="btn d-lg-none"
                                    onClick={() => setSidebarOpen(!sidebarOpen)}
                                    style={{
                                        background: darkMode ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
                                        border: 'none',
                                        color: darkMode ? 'white' : '#1a1f36'
                                    }}
                                >
                                    <i className="bi bi-list fs-5"></i>
                                </button>
                                <div>
                                    <h5 className="mb-0 fw-bold" style={{ color: darkMode ? '#f8fafc' : '#1a1f36' }}>
                                        <i className="bi bi-graph-up-arrow me-2" style={{ color: '#8b5cf6' }}></i>
                                        Analytics Dashboard
                                    </h5>
                                    <p className="mb-0 small" style={{ color: darkMode ? 'rgba(255,255,255,0.75)' : '#64748b' }}>
                                        Monitor performance, trends, and AI insights
                                    </p>
                                </div>
                            </div>
                            <div className="d-flex align-items-center gap-3">
                                {/* Time Period Selector */}
                                <div className="btn-group" role="group">
                                    {[7, 30, 90].map(d => (
                                        <button
                                            key={d}
                                            type="button"
                                            className="btn btn-sm"
                                            onClick={() => setDays(d)}
                                            style={{
                                                background: days === d
                                                    ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                                                    : darkMode ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
                                                color: days === d ? 'white' : darkMode ? 'rgba(255,255,255,0.6)' : '#64748b',
                                                border: days === d ? 'none' : darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e2e8f0',
                                                fontWeight: days === d ? '600' : '500',
                                                fontSize: '0.8rem',
                                                padding: '6px 14px',
                                                borderRadius: d === 7 ? '8px 0 0 8px' : d === 90 ? '0 8px 8px 0' : '0'
                                            }}
                                        >
                                            {d}D
                                        </button>
                                    ))}
                                </div>
                                {/* Dark Mode Toggle */}
                                <button
                                    className="btn d-flex align-items-center justify-content-center"
                                    onClick={toggleDarkMode}
                                    style={{
                                        width: '38px',
                                        height: '38px',
                                        borderRadius: '10px',
                                        background: darkMode ? 'rgba(255,255,255,0.08)' : '#f1f5f9',
                                        border: darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e2e8f0',
                                        color: darkMode ? '#fbbf24' : '#64748b',
                                        transition: 'all 0.2s ease'
                                    }}
                                    title={darkMode ? 'Light Mode' : 'Dark Mode'}
                                >
                                    <i className={`bi ${darkMode ? 'bi-sun-fill' : 'bi-moon-fill'}`} style={{ fontSize: '1rem' }}></i>
                                </button>
                                {/* Refresh */}
                                <button
                                    className="btn d-flex align-items-center justify-content-center"
                                    onClick={loadDashboardData}
                                    style={{
                                        width: '38px',
                                        height: '38px',
                                        borderRadius: '10px',
                                        background: darkMode ? 'rgba(255,255,255,0.08)' : '#f1f5f9',
                                        border: darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e2e8f0',
                                        color: darkMode ? 'rgba(255,255,255,0.7)' : '#64748b',
                                        transition: 'all 0.2s ease'
                                    }}
                                    title="Refresh Data"
                                >
                                    <i className="bi bi-arrow-repeat" style={{ fontSize: '1rem' }}></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Content */}
                <div className="container-fluid p-4">
                    {loading ? (
                        <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '60vh' }}>
                            <div className="text-center">
                                <div className="spinner-border" style={{ width: '3rem', height: '3rem', color: '#8b5cf6' }} role="status">
                                    <span className="visually-hidden">Loading...</span>
                                </div>
                                <p className="mt-3" style={{ color: darkMode ? 'rgba(255,255,255,0.75)' : '#64748b' }}>Loading analytics...</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Summary Stats Cards */}
                            {dashboardData && (
                                <div className="row g-3 mb-4">
                                    {[
                                        {
                                            icon: 'bi-people-fill',
                                            value: dashboardData.summary.total_patients,
                                            label: 'Total Patients',
                                            gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                            shadow: 'rgba(59, 130, 246, 0.3)'
                                        },
                                        {
                                            icon: 'bi-clipboard2-pulse-fill',
                                            value: dashboardData.summary.recent_encounters,
                                            label: 'Recent Encounters',
                                            gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                                            shadow: 'rgba(34, 197, 94, 0.3)'
                                        },
                                        {
                                            icon: 'bi-activity',
                                            value: dashboardData.summary.active_encounters,
                                            label: 'Active Encounters',
                                            gradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                                            shadow: 'rgba(249, 115, 22, 0.3)'
                                        },
                                        {
                                            icon: 'bi-journal-medical',
                                            value: encounterTrends?.total_encounters || 0,
                                            label: `Total (${days}d)`,
                                            gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                                            shadow: 'rgba(139, 92, 246, 0.3)'
                                        }
                                    ].map((stat, idx) => (
                                        <div key={idx} className="col-6 col-lg-3">
                                            <div
                                                className="p-3 text-white"
                                                style={{
                                                    borderRadius: '16px',
                                                    background: stat.gradient,
                                                    boxShadow: `0 8px 24px ${stat.shadow}`,
                                                    transition: 'transform 0.25s ease',
                                                    cursor: 'default'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                                                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                                            >
                                                <div className="d-flex align-items-center gap-3">
                                                    <div
                                                        className="rounded-circle d-flex align-items-center justify-content-center"
                                                        style={{ width: '44px', height: '44px', background: 'rgba(255,255,255,0.2)', flexShrink: 0 }}
                                                    >
                                                        <i className={`bi ${stat.icon} fs-5`}></i>
                                                    </div>
                                                    <div>
                                                        <h3 className="mb-0 fw-bold">{stat.value}</h3>
                                                        <small className="opacity-75" style={{ fontSize: '0.78rem' }}>{stat.label}</small>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Row: Encounter Trends + Triage Distribution */}
                            <div className="row g-4 mb-4">
                                {/* Encounter Trends */}
                                {encounterTrends && (
                                    <div className="col-lg-6">
                                        <div
                                            style={{
                                                borderRadius: '18px',
                                                background: darkMode ? 'rgba(30, 41, 59, 0.65)' : 'white',
                                                backdropFilter: 'blur(12px)',
                                                border: darkMode ? '1px solid rgba(255,255,255,0.07)' : '1px solid #f1f5f9',
                                                boxShadow: darkMode ? '0 4px 20px rgba(0,0,0,0.25)' : '0 4px 20px rgba(0,0,0,0.06)',
                                                overflow: 'hidden',
                                                height: '100%'
                                            }}
                                        >
                                            <div className="p-4 d-flex align-items-center gap-2" style={{
                                                borderBottom: darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f1f5f9'
                                            }}>
                                                <div className="rounded-circle d-flex align-items-center justify-content-center" style={{
                                                    width: '36px', height: '36px',
                                                    background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)'
                                                }}>
                                                    <i className="bi bi-bar-chart-line-fill text-white" style={{ fontSize: '0.9rem' }}></i>
                                                </div>
                                                <h6 className="mb-0 fw-bold" style={{ color: darkMode ? '#f8fafc' : '#1a1f36' }}>Encounter Trends</h6>
                                            </div>
                                            <div className="p-4">
                                                {/* Stats */}
                                                <div className="row g-3 mb-4">
                                                    <div className="col-6">
                                                        <div className="text-center p-3 rounded-4" style={{
                                                            background: darkMode ? 'rgba(20, 184, 166, 0.1)' : '#f0fdf4'
                                                        }}>
                                                            <h3 className="fw-bold mb-0" style={{ color: '#14B8A6' }}>{encounterTrends.total_encounters}</h3>
                                                            <small style={{ color: darkMode ? 'rgba(255,255,255,0.75)' : '#64748b', fontSize: '0.78rem' }}>Total Encounters</small>
                                                        </div>
                                                    </div>
                                                    <div className="col-6">
                                                        <div className="text-center p-3 rounded-4" style={{
                                                            background: darkMode ? 'rgba(59, 130, 246, 0.1)' : '#eff6ff'
                                                        }}>
                                                            <h3 className="fw-bold mb-0" style={{ color: '#3b82f6' }}>{encounterTrends.average_per_day}</h3>
                                                            <small style={{ color: darkMode ? 'rgba(255,255,255,0.75)' : '#64748b', fontSize: '0.78rem' }}>Daily Average</small>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Weekly Activity Bar Chart */}
                                                <div>
                                                    <h6 className="fw-semibold mb-3" style={{ color: darkMode ? 'rgba(255,255,255,0.75)' : '#64748b', fontSize: '0.8rem' }}>
                                                        <i className="bi bi-activity me-2"></i>
                                                        Weekly Activity
                                                    </h6>
                                                    <div className="d-flex align-items-end justify-content-between gap-2" style={{ height: '80px' }}>
                                                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => {
                                                            const heights = [60, 80, 45, 90, 70, 30, 20];
                                                            return (
                                                                <div key={day} className="text-center flex-fill">
                                                                    <div
                                                                        className="rounded-2 mx-auto mb-1"
                                                                        style={{
                                                                            width: '100%',
                                                                            height: `${heights[idx]}%`,
                                                                            background: 'linear-gradient(180deg, #14B8A6 0%, #0D9488 100%)',
                                                                            minHeight: '8px',
                                                                            transition: 'height 0.5s ease'
                                                                        }}
                                                                    ></div>
                                                                    <small style={{ color: darkMode ? 'rgba(255,255,255,0.9)' : '#64748b', fontSize: '0.75rem', fontWeight: '500' }}>{day}</small>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Triage Distribution */}
                                {encounterTrends && (
                                    <div className="col-lg-6">
                                        <div
                                            style={{
                                                borderRadius: '18px',
                                                background: darkMode ? 'rgba(30, 41, 59, 0.65)' : 'white',
                                                backdropFilter: 'blur(12px)',
                                                border: darkMode ? '1px solid rgba(255,255,255,0.07)' : '1px solid #f1f5f9',
                                                boxShadow: darkMode ? '0 4px 20px rgba(0,0,0,0.25)' : '0 4px 20px rgba(0,0,0,0.06)',
                                                overflow: 'hidden',
                                                height: '100%'
                                            }}
                                        >
                                            <div className="p-4 d-flex align-items-center gap-2" style={{
                                                borderBottom: darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f1f5f9'
                                            }}>
                                                <div className="rounded-circle d-flex align-items-center justify-content-center" style={{
                                                    width: '36px', height: '36px',
                                                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                                                }}>
                                                    <i className="bi bi-speedometer2 text-white" style={{ fontSize: '0.9rem' }}></i>
                                                </div>
                                                <h6 className="mb-0 fw-bold" style={{ color: darkMode ? '#f8fafc' : '#1a1f36' }}>Triage Distribution</h6>
                                            </div>
                                            <div className="p-4">
                                                {[
                                                    { level: 'Emergent', value: triageData.emergent || 0, color: '#dc2626', bg: darkMode ? 'rgba(220,38,38,0.1)' : '#fef2f2' },
                                                    { level: 'Urgent', value: triageData.urgent || 0, color: '#f97316', bg: darkMode ? 'rgba(249,115,22,0.1)' : '#fff7ed' },
                                                    { level: 'Routine', value: triageData.routine || 0, color: '#22c55e', bg: darkMode ? 'rgba(34,197,94,0.1)' : '#f0fdf4' },
                                                    { level: 'Not Assessed', value: triageData.not_assessed || 0, color: '#9ca3af', bg: darkMode ? 'rgba(156,163,175,0.1)' : '#f9fafb' }
                                                ].map((item, idx) => {
                                                    const total = (triageData.emergent || 0) + (triageData.urgent || 0) + (triageData.routine || 0) + (triageData.not_assessed || 0);
                                                    const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;

                                                    return (
                                                        <div key={idx} className="mb-3">
                                                            <div className="d-flex justify-content-between align-items-center mb-2">
                                                                <div className="d-flex align-items-center gap-2">
                                                                    <div className="rounded-circle" style={{ width: '10px', height: '10px', background: item.color }}></div>
                                                                    <span className="fw-medium" style={{ color: darkMode ? '#f8fafc' : '#1a1f36', fontSize: '0.88rem' }}>{item.level}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="fw-bold" style={{ color: item.color }}>{item.value}</span>
                                                                    <span className="fw-medium" style={{ color: darkMode ? 'rgba(255,255,255,0.9)' : '#475569', fontSize: '0.85rem' }}> ({percentage}%)</span>
                                                                </div>
                                                            </div>
                                                            <div className="progress" style={{ height: '6px', borderRadius: '3px', background: item.bg }}>
                                                                <div
                                                                    className="progress-bar"
                                                                    style={{
                                                                        width: `${percentage}%`,
                                                                        background: item.color,
                                                                        borderRadius: '3px',
                                                                        transition: 'width 0.6s ease'
                                                                    }}
                                                                ></div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                                <div className="text-center mt-4 p-2 rounded-3" style={{
                                                    background: darkMode ? 'rgba(255,255,255,0.03)' : '#f8fafc'
                                                }}>
                                                    <small style={{ color: darkMode ? 'rgba(255,255,255,0.7)' : '#94a3b8', fontSize: '0.78rem' }}>
                                                        <i className="bi bi-info-circle me-1"></i>
                                                        Based on {days}-day period analysis
                                                    </small>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* AI System Performance */}
                            {aiStats && (
                                <div className="mb-4">
                                    <div
                                        style={{
                                            borderRadius: '18px',
                                            background: darkMode ? 'rgba(30, 41, 59, 0.65)' : 'white',
                                            backdropFilter: 'blur(12px)',
                                            border: darkMode ? '1px solid rgba(255,255,255,0.07)' : '1px solid #f1f5f9',
                                            boxShadow: darkMode ? '0 4px 20px rgba(0,0,0,0.25)' : '0 4px 20px rgba(0,0,0,0.06)',
                                            overflow: 'hidden'
                                        }}
                                    >
                                        <div className="p-4 d-flex align-items-center gap-2" style={{
                                            borderBottom: darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f1f5f9'
                                        }}>
                                            <div className="rounded-circle d-flex align-items-center justify-content-center" style={{
                                                width: '36px', height: '36px',
                                                background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                                            }}>
                                                <i className="bi bi-robot text-white" style={{ fontSize: '0.9rem' }}></i>
                                            </div>
                                            <h6 className="mb-0 fw-bold" style={{ color: darkMode ? '#f8fafc' : '#1a1f36' }}>AI System Performance</h6>
                                        </div>
                                        <div className="p-4">
                                            <div className="row g-4">
                                                <div className="col-md-4">
                                                    <div className="text-center p-4 rounded-4 h-100" style={{
                                                        background: darkMode
                                                            ? 'linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(124,58,237,0.05) 100%)'
                                                            : 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
                                                        border: darkMode ? '1px solid rgba(139,92,246,0.15)' : '1px solid #ede9fe'
                                                    }}>
                                                        <div
                                                            className="rounded-circle d-inline-flex align-items-center justify-content-center mb-3"
                                                            style={{
                                                                width: '64px',
                                                                height: '64px',
                                                                background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                                                                boxShadow: '0 8px 16px rgba(139, 92, 246, 0.3)'
                                                            }}
                                                        >
                                                            <span className="text-white fw-bold fs-4">{aiStats.ai_assisted_encounters}</span>
                                                        </div>
                                                        <h6 className="fw-bold mb-1" style={{ color: darkMode ? '#f8fafc' : '#1a1f36' }}>AI Assisted</h6>
                                                        <small style={{ color: darkMode ? 'rgba(255,255,255,0.75)' : '#64748b', fontSize: '0.78rem' }}>
                                                            {aiStats.total_encounters} total in {aiStats.period_days}d
                                                        </small>
                                                    </div>
                                                </div>

                                                <div className="col-md-4">
                                                    <div className="text-center p-4 rounded-4 h-100" style={{
                                                        background: darkMode
                                                            ? 'linear-gradient(135deg, rgba(34,197,94,0.1) 0%, rgba(22,163,74,0.05) 100%)'
                                                            : 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                                                        border: darkMode ? '1px solid rgba(34,197,94,0.15)' : '1px solid #bbf7d0'
                                                    }}>
                                                        <div
                                                            className="rounded-circle d-inline-flex align-items-center justify-content-center mb-3"
                                                            style={{
                                                                width: '64px',
                                                                height: '64px',
                                                                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                                                                boxShadow: '0 8px 16px rgba(34, 197, 94, 0.3)'
                                                            }}
                                                        >
                                                            <span className="text-white fw-bold fs-4">{aiStats.active_tools}</span>
                                                        </div>
                                                        <h6 className="fw-bold mb-1" style={{ color: darkMode ? '#f8fafc' : '#1a1f36' }}>Active Tools</h6>
                                                        <small style={{ color: darkMode ? 'rgba(255,255,255,0.75)' : '#64748b', fontSize: '0.78rem' }}>
                                                            {aiStats.agent_system}
                                                        </small>
                                                    </div>
                                                </div>

                                                <div className="col-md-4">
                                                    <div className="text-center p-4 rounded-4 h-100" style={{
                                                        background: darkMode
                                                            ? 'linear-gradient(135deg, rgba(20,184,166,0.1) 0%, rgba(13,148,136,0.05) 100%)'
                                                            : 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)',
                                                        border: darkMode ? '1px solid rgba(20,184,166,0.15)' : '1px solid #99f6e4'
                                                    }}>
                                                        <div
                                                            className="rounded-circle d-inline-flex align-items-center justify-content-center mb-3"
                                                            style={{
                                                                width: '64px',
                                                                height: '64px',
                                                                background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
                                                                boxShadow: '0 8px 16px rgba(20, 184, 166, 0.3)'
                                                            }}
                                                        >
                                                            <span className="text-white fw-bold fs-5">
                                                                {aiStats.total_encounters > 0 ? Math.round((aiStats.ai_assisted_encounters / aiStats.total_encounters) * 100) : 0}%
                                                            </span>
                                                        </div>
                                                        <h6 className="fw-bold mb-1" style={{ color: darkMode ? '#f8fafc' : '#1a1f36' }}>AI Coverage</h6>
                                                        <small style={{ color: darkMode ? 'rgba(255,255,255,0.75)' : '#64748b', fontSize: '0.78rem' }}>
                                                            Of all encounters
                                                        </small>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Quick Actions */}
                            <div
                                style={{
                                    borderRadius: '18px',
                                    background: darkMode ? 'rgba(30, 41, 59, 0.65)' : 'white',
                                    backdropFilter: 'blur(12px)',
                                    border: darkMode ? '1px solid rgba(255,255,255,0.07)' : '1px solid #f1f5f9',
                                    boxShadow: darkMode ? '0 4px 20px rgba(0,0,0,0.25)' : '0 4px 20px rgba(0,0,0,0.06)',
                                    overflow: 'hidden'
                                }}
                            >
                                <div className="p-4">
                                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
                                        <div>
                                            <h6 className="fw-bold mb-1" style={{ color: darkMode ? '#f8fafc' : '#1a1f36' }}>
                                                <i className="bi bi-lightning-charge-fill me-2" style={{ color: '#fbbf24' }}></i>
                                                Quick Actions
                                            </h6>
                                            <small style={{ color: darkMode ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>Jump to common tasks</small>
                                        </div>
                                        <div className="d-flex flex-wrap gap-2">
                                            <button
                                                className="btn d-flex align-items-center gap-2"
                                                onClick={() => navigate('/patients')}
                                                style={{
                                                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '10px',
                                                    fontWeight: '600',
                                                    fontSize: '0.85rem',
                                                    padding: '8px 16px',
                                                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                                                }}
                                            >
                                                <i className="bi bi-people"></i>
                                                View Patients
                                            </button>
                                            <button
                                                className="btn d-flex align-items-center gap-2"
                                                onClick={() => navigate('/dashboard')}
                                                style={{
                                                    background: darkMode ? 'rgba(255,255,255,0.08)' : '#f1f5f9',
                                                    color: darkMode ? 'rgba(255,255,255,0.7)' : '#64748b',
                                                    border: darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e2e8f0',
                                                    borderRadius: '10px',
                                                    fontWeight: '500',
                                                    fontSize: '0.85rem',
                                                    padding: '8px 16px'
                                                }}
                                            >
                                                <i className="bi bi-grid-1x2"></i>
                                                Dashboard
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
