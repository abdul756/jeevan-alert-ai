import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import apiService from '../services/apiService';
import { useDarkMode } from '../context/DarkModeContext';
import jeevanAlertLogo from '../assets/jeevanalert.svg';

function Dashboard() {
    const navigate = useNavigate();
    const location = useLocation();
    const [dashboardData, setDashboardData] = useState(null);
    const [userName, setUserName] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [recentPatients, setRecentPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const { darkMode, toggleDarkMode } = useDarkMode();

    useEffect(() => {
        const staffId = localStorage.getItem('staffId');
        if (!staffId) {
            navigate('/');
            return;
        }

        const name = localStorage.getItem('userName') || 'CHW User';
        setUserName(name);
        loadDashboard();
        loadRecentPatients();
    }, [navigate]);

    const loadDashboard = async () => {
        try {
            const analytics = await apiService.getDashboardData(30);
            setDashboardData(analytics);
        } catch (error) {
            console.error('Failed to load dashboard:', error);
            setDashboardData({
                summary: {
                    total_patients: 0,
                    recent_encounters: 0,
                    pending_referrals: 0,
                    emergency_cases: 0
                }
            });
        } finally {
            setLoading(false);
        }
    };

    const loadRecentPatients = async () => {
        try {
            const response = await apiService.getPatients();
            const sorted = response.patients
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 5);
            setRecentPatients(sorted);
        } catch (error) {
            console.error('Failed to load patients:', error);
            setRecentPatients([]);
        }
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 17) return 'Good Afternoon';
        return 'Good Evening';
    };

    const getCurrentDate = () => {
        return new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const handleLogout = () => {
        localStorage.clear();
        navigate('/');
    };

    const isActive = (path) => location.pathname === path;

    const calculateAge = (dob) => {
        if (!dob) return 'N/A';
        const birthDate = new Date(dob);
        const diff = Date.now() - birthDate.getTime();
        return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
    };

    return (
        <div className="d-flex min-vh-100" style={{
            background: darkMode
                ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
                : 'linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%)',
            transition: 'background 0.3s ease'
        }}>
            {/* Industry-Standard Sidebar */}
            <aside
                className={`d-flex flex-column ${sidebarOpen ? '' : 'd-none d-lg-flex'}`}
                style={{
                    width: '280px',
                    background: darkMode
                        ? 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)'
                        : 'linear-gradient(180deg, #1e293b 0%, #334155 100%)',
                    boxShadow: darkMode
                        ? '4px 0 24px rgba(0,0,0,0.5)'
                        : '4px 0 24px rgba(0,0,0,0.15)',
                    zIndex: 1000,
                    transition: 'all 0.3s ease',
                    borderRight: darkMode ? '1px solid rgba(255,255,255,0.05)' : 'none'
                }}
            >
                {/* Logo */}
                <div className="p-4 border-bottom" style={{ borderColor: 'rgba(255,255,255,0.1) !important' }}>
                    <Link to="/dashboard" className="text-decoration-none d-flex justify-content-center">
                        <img src={jeevanAlertLogo} alt="JeevanAlert AI" style={{ width: '100%', maxWidth: '200px', height: 'auto', filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.25))' }} />
                    </Link>
                </div>

                {/* Navigation */}
                <nav className="flex-grow-1 py-4 px-2">
                    <div className="px-3 mb-3">
                        <span className="text-uppercase small fw-semibold" style={{
                            color: 'rgba(255,255,255,0.4)',
                            letterSpacing: '0.5px',
                            fontSize: '0.7rem'
                        }}>MAIN MENU</span>
                    </div>

                    <Link
                        to="/dashboard"
                        className="d-flex align-items-center gap-3 px-3 py-2 text-decoration-none rounded-3 mb-1 position-relative"
                        style={{
                            background: isActive('/dashboard') ? 'rgba(20, 184, 166, 0.15)' : 'transparent',
                            color: isActive('/dashboard') ? '#14B8A6' : 'rgba(255,255,255,0.7)',
                            transition: 'all 0.2s ease',
                            borderLeft: isActive('/dashboard') ? '3px solid #14B8A6' : '3px solid transparent',
                            paddingLeft: '16px'
                        }}
                        onMouseEnter={(e) => {
                            if (!isActive('/dashboard')) {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                                e.currentTarget.style.color = 'white';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isActive('/dashboard')) {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                            }
                        }}
                    >
                        <i className="bi bi-grid-1x2-fill" style={{ fontSize: '1.1rem' }}></i>
                        <span className="fw-medium" style={{ fontSize: '0.95rem' }}>Dashboard</span>
                    </Link>

                    <Link
                        to="/patients"
                        className="d-flex align-items-center gap-3 px-3 py-2 text-decoration-none rounded-3 mb-1"
                        style={{
                            background: isActive('/patients') ? 'rgba(20, 184, 166, 0.15)' : 'transparent',
                            color: isActive('/patients') ? '#14B8A6' : 'rgba(255,255,255,0.7)',
                            transition: 'all 0.2s ease',
                            borderLeft: isActive('/patients') ? '3px solid #14B8A6' : '3px solid transparent',
                            paddingLeft: '16px'
                        }}
                        onMouseEnter={(e) => {
                            if (!isActive('/patients')) {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                                e.currentTarget.style.color = 'white';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isActive('/patients')) {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                            }
                        }}
                    >
                        <i className="bi bi-people-fill" style={{ fontSize: '1.1rem' }}></i>
                        <span className="fw-medium" style={{ fontSize: '0.95rem' }}>Patients</span>
                    </Link>


                    <Link
                        to="/charma-scan"
                        className="d-flex align-items-center gap-3 px-3 py-2 text-decoration-none rounded-3 mb-1"
                        style={{
                            background: isActive('/charma-scan') ? 'rgba(236, 72, 153, 0.15)' : 'transparent',
                            color: isActive('/charma-scan') ? '#EC4899' : 'rgba(255,255,255,0.7)',
                            transition: 'all 0.2s ease',
                            borderLeft: isActive('/charma-scan') ? '3px solid #EC4899' : '3px solid transparent',
                            paddingLeft: '16px'
                        }}
                        onMouseEnter={(e) => {
                            if (!isActive('/charma-scan')) {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                                e.currentTarget.style.color = 'white';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isActive('/charma-scan')) {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                            }
                        }}
                    >
                        <i className="bi bi-search" style={{ fontSize: '1.1rem' }}></i>
                        <span className="fw-medium flex-grow-1" style={{ fontSize: '0.95rem' }}>Charma Scan</span>
                        <span className="badge" style={{
                            background: isActive('/charma-scan') ? 'rgba(236, 72, 153, 0.3)' : 'rgba(255,255,255,0.1)',
                            fontSize: '0.65rem',
                            padding: '3px 6px',
                            fontWeight: '600'
                        }}>AI</span>
                    </Link>

                    <Link
                        to="/analytics"
                        className="d-flex align-items-center gap-3 px-3 py-2 text-decoration-none rounded-3 mb-1"
                        style={{
                            background: isActive('/analytics') ? 'rgba(20, 184, 166, 0.15)' : 'transparent',
                            color: isActive('/analytics') ? '#14B8A6' : 'rgba(255,255,255,0.7)',
                            transition: 'all 0.2s ease',
                            borderLeft: isActive('/analytics') ? '3px solid #14B8A6' : '3px solid transparent',
                            paddingLeft: '16px'
                        }}
                        onMouseEnter={(e) => {
                            if (!isActive('/analytics')) {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                                e.currentTarget.style.color = 'white';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isActive('/analytics')) {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                            }
                        }}
                    >
                        <i className="bi bi-bar-chart-line-fill" style={{ fontSize: '1.1rem' }}></i>
                        <span className="fw-medium" style={{ fontSize: '0.95rem' }}>Analytics</span>
                    </Link>
                </nav>

                {/* User Profile & Logout */}
                <div className="p-3 border-top" style={{ borderColor: 'rgba(255,255,255,0.1) !important' }}>
                    <div className="d-flex align-items-center gap-3 p-2 rounded-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div
                            className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold"
                            style={{
                                width: '40px',
                                height: '40px',
                                background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)'
                            }}
                        >
                            {userName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-grow-1">
                            <div className="text-white fw-medium small">{userName}</div>
                            <div className="text-white-50" style={{ fontSize: '11px' }}>Community Health Worker</div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="btn btn-link p-2 text-white-50"
                            title="Logout"
                        >
                            <i className="bi bi-box-arrow-right fs-5"></i>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-grow-1 overflow-auto">
                {/* Top Header */}
                <header className="shadow-sm sticky-top" style={{
                    background: darkMode ? '#1e293b' : '#ffffff',
                    borderBottom: darkMode ? '1px solid rgba(255,255,255,0.1)' : 'none',
                    transition: 'all 0.3s ease'
                }}>
                    <div className="container-fluid py-3 px-4">
                        <div className="d-flex justify-content-between align-items-center">
                            <div>
                                <button
                                    className="btn d-lg-none me-3"
                                    onClick={() => setSidebarOpen(!sidebarOpen)}
                                    style={{
                                        background: darkMode ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
                                        border: 'none',
                                        color: darkMode ? 'white' : '#1a1f36'
                                    }}
                                >
                                    <i className="bi bi-list fs-4"></i>
                                </button>
                                <h4 className="mb-0 fw-bold d-inline-block" style={{ color: darkMode ? 'white' : '#1a1f36' }}>
                                    {getGreeting()}, {userName.split(' ')[0]}! 👋
                                </h4>
                                <p className="mb-0 small mt-1" style={{ color: darkMode ? 'rgba(255,255,255,0.6)' : '#64748b' }}>
                                    {getCurrentDate()}
                                </p>
                            </div>
                            <div className="d-flex gap-2 align-items-center">
                                {/* Dark Mode Toggle */}
                                <button
                                    onClick={toggleDarkMode}
                                    className="btn d-flex align-items-center justify-content-center"
                                    style={{
                                        width: '44px',
                                        height: '44px',
                                        background: darkMode ? 'rgba(255,255,255,0.1)' : '#f1f5f9',
                                        border: 'none',
                                        borderRadius: '12px',
                                        color: darkMode ? '#fbbf24' : '#64748b',
                                        transition: 'all 0.3s ease'
                                    }}
                                    title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                                >
                                    <i className={`bi ${darkMode ? 'bi-sun-fill' : 'bi-moon-fill'} fs-5`}></i>
                                </button>
                                <button
                                    className="btn d-flex align-items-center gap-2"
                                    onClick={() => navigate('/patients')}
                                    style={{
                                        background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                                        color: 'white',
                                        border: 'none',
                                        padding: '10px 20px',
                                        borderRadius: '10px',
                                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                                    }}
                                >
                                    <i className="bi bi-plus-circle-fill"></i>
                                    <span>New Visit</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Dashboard Content */}
                <div className="container-fluid p-4">
                    {/* Stats Cards */}
                    {loading ? (
                        <div className="text-center py-5">
                            <div className="spinner-border text-primary" role="status">
                                <span className="visually-hidden">Loading...</span>
                            </div>
                        </div>
                    ) : dashboardData && (
                        <div className="row g-4 mb-4">
                            {/* Total Patients */}
                            <div className="col-12 col-sm-6 col-xl-3">
                                <div
                                    className="h-100 position-relative overflow-hidden"
                                    style={{
                                        borderRadius: '16px',
                                        backgroundImage: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
                                        backgroundColor: '#14B8A6',
                                        boxShadow: '0 8px 24px rgba(20, 184, 166, 0.25)'
                                    }}
                                >
                                    <div className="p-4">
                                        <div className="d-flex justify-content-between align-items-start mb-3">
                                            <div
                                                className="rounded-3 p-3"
                                                style={{ background: 'rgba(255,255,255,0.2)' }}
                                            >
                                                <i className="bi bi-people-fill fs-4 text-white"></i>
                                            </div>
                                            <span className="badge rounded-pill" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                                                <i className="bi bi-arrow-up me-1"></i>12%
                                            </span>
                                        </div>
                                        <h2 className="text-white fw-bold mb-1">{dashboardData.summary.total_patients}</h2>
                                        <p className="text-white-50 mb-0">Total Patients</p>
                                    </div>
                                </div>
                            </div>

                            {/* Recent Encounters */}
                            <div className="col-12 col-sm-6 col-xl-3">
                                <div
                                    className="h-100 position-relative overflow-hidden"
                                    style={{
                                        borderRadius: '16px',
                                        backgroundImage: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                                        backgroundColor: '#6366F1',
                                        boxShadow: '0 8px 24px rgba(99, 102, 241, 0.25)'
                                    }}
                                >
                                    <div className="p-4">
                                        <div className="d-flex justify-content-between align-items-start mb-3">
                                            <div
                                                className="rounded-3 p-3"
                                                style={{ background: 'rgba(255,255,255,0.2)' }}
                                            >
                                                <i className="bi bi-clipboard2-pulse-fill fs-4 text-white"></i>
                                            </div>
                                            <span className="badge rounded-pill" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                                                <i className="bi bi-arrow-up me-1"></i>8%
                                            </span>
                                        </div>
                                        <h2 className="text-white fw-bold mb-1">{dashboardData.summary.recent_encounters}</h2>
                                        <p className="text-white-50 mb-0">Recent Encounters</p>
                                    </div>
                                </div>
                            </div>

                            {/* Pending Referrals */}
                            <div className="col-12 col-sm-6 col-xl-3">
                                <div
                                    className="h-100 position-relative overflow-hidden"
                                    style={{
                                        borderRadius: '16px',
                                        backgroundImage: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                                        backgroundColor: '#F59E0B',
                                        boxShadow: '0 8px 24px rgba(245, 158, 11, 0.25)'
                                    }}
                                >
                                    <div className="p-4">
                                        <div className="d-flex justify-content-between align-items-start mb-3">
                                            <div
                                                className="rounded-3 p-3"
                                                style={{ background: 'rgba(255,255,255,0.2)' }}
                                            >
                                                <i className="bi bi-send-fill fs-4 text-white"></i>
                                            </div>
                                            <span className="badge rounded-pill" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                                                <i className="bi bi-exclamation-circle me-1"></i>Action
                                            </span>
                                        </div>
                                        <h2 className="text-white fw-bold mb-1">{dashboardData.summary.pending_referrals}</h2>
                                        <p className="text-white-50 mb-0">Pending Referrals</p>
                                    </div>
                                </div>
                            </div>

                            {/* Emergency Cases */}
                            <div className="col-12 col-sm-6 col-xl-3">
                                <div
                                    className="h-100 position-relative overflow-hidden"
                                    style={{
                                        borderRadius: '16px',
                                        backgroundImage: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                                        backgroundColor: '#EF4444',
                                        boxShadow: '0 8px 24px rgba(239, 68, 68, 0.25)'
                                    }}
                                >
                                    <div className="p-4">
                                        <div className="d-flex justify-content-between align-items-start mb-3">
                                            <div
                                                className="rounded-3 p-3"
                                                style={{ background: 'rgba(255,255,255,0.2)' }}
                                            >
                                                <i className="bi bi-exclamation-triangle-fill fs-4 text-white"></i>
                                            </div>
                                            <span className="badge rounded-pill" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                                                <i className="bi bi-lightning-fill me-1"></i>Urgent
                                            </span>
                                        </div>
                                        <h2 className="text-white fw-bold mb-1">{dashboardData.summary.emergency_cases}</h2>
                                        <p className="text-white-50 mb-0">Emergency Cases</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Quick Actions */}
                    <div className="row g-4 mb-4">
                        <div className="col-12 col-lg-4">
                            <div
                                className="card border-0 h-100"
                                style={{
                                    borderRadius: '16px',
                                    cursor: 'pointer',
                                    transition: 'transform 0.2s ease, box-shadow 0.2s ease, background 0.3s ease',
                                    background: darkMode ? '#1e293b' : 'white'
                                }}
                                onClick={() => navigate('/patients')}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-4px)';
                                    e.currentTarget.style.boxShadow = darkMode
                                        ? '0 12px 32px rgba(0,0,0,0.5)'
                                        : '0 12px 32px rgba(0,0,0,0.12)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                <div className="card-body p-4 d-flex align-items-center gap-4">
                                    <div
                                        className="rounded-circle d-flex align-items-center justify-content-center"
                                        style={{
                                            width: '64px',
                                            height: '64px',
                                            background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
                                            boxShadow: '0 8px 16px rgba(20, 184, 166, 0.3)'
                                        }}
                                    >
                                        <i className="bi bi-person-plus-fill fs-3 text-white"></i>
                                    </div>
                                    <div>
                                        <h5 className="fw-bold mb-1" style={{ color: darkMode ? 'white' : '#1a1f36' }}>Start New Visit</h5>
                                        <p className="mb-0 small" style={{ color: darkMode ? 'rgba(255,255,255,0.6)' : '#64748b' }}>
                                            Register or select a patient
                                        </p>
                                    </div>
                                    <i className="bi bi-chevron-right ms-auto fs-4" style={{ color: darkMode ? 'rgba(255,255,255,0.4)' : '#94a3b8' }}></i>
                                </div>
                            </div>
                        </div>



                        <div className="col-12 col-lg-4">
                            <div
                                className="card border-0 h-100"
                                style={{
                                    borderRadius: '16px',
                                    cursor: 'pointer',
                                    transition: 'transform 0.2s ease, box-shadow 0.2s ease, background 0.3s ease',
                                    background: darkMode ? '#1e293b' : 'white'
                                }}
                                onClick={() => navigate('/charma-scan')}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-4px)';
                                    e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.12)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                <div className="card-body p-4 d-flex align-items-center gap-4">
                                    <div
                                        className="rounded-circle d-flex align-items-center justify-content-center"
                                        style={{
                                            width: '64px',
                                            height: '64px',
                                            background: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
                                            boxShadow: '0 8px 16px rgba(236, 72, 153, 0.3)'
                                        }}
                                    >
                                        <i className="bi bi-camera-fill fs-3 text-white"></i>
                                    </div>
                                    <div>
                                        <h5 className="fw-bold mb-1" style={{ color: darkMode ? 'white' : '#1a1f36' }}>Charma Scan</h5>
                                        <p className="mb-0 small" style={{ color: darkMode ? 'rgba(255,255,255,0.6)' : '#64748b' }}>Skin lesion analysis</p>
                                    </div>
                                    <i className="bi bi-chevron-right ms-auto fs-4" style={{ color: darkMode ? 'rgba(255,255,255,0.4)' : '#94a3b8' }}></i>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Recent Patients */}
                    <div className="card border-0 recent-patients-card" style={{
                        borderRadius: '16px',
                        background: darkMode ? '#1e293b' : 'white',
                        transition: 'background 0.3s ease'
                    }}>
                        <div className="card-header border-0 p-4 d-flex justify-content-between align-items-center" style={{
                            borderRadius: '16px 16px 0 0',
                            background: darkMode ? '#1e293b' : 'white',
                            borderBottom: darkMode ? '1px solid rgba(255,255,255,0.1)' : undefined
                        }}>
                            <div>
                                <h5 className="fw-bold mb-1" style={{ color: darkMode ? 'white' : '#1a1f36' }}>
                                    <i className="bi bi-clock-history me-2" style={{ color: darkMode ? '#14B8A6' : '#6366F1' }}></i>
                                    Recent Patients
                                </h5>
                                <p className="mb-0 small" style={{ color: darkMode ? 'rgba(255,255,255,0.6)' : '#64748b' }}>Your latest patient registrations</p>
                            </div>
                            <Link
                                to="/patients"
                                className="btn btn-outline-primary d-flex align-items-center gap-2"
                                style={{ borderRadius: '10px' }}
                            >
                                View All
                                <i className="bi bi-arrow-right"></i>
                            </Link>
                        </div>
                        <div className="card-body p-0">
                            {recentPatients.length === 0 ? (
                                <div className="text-center py-5">
                                    <div
                                        className="rounded-circle mx-auto mb-3 d-flex align-items-center justify-content-center"
                                        style={{
                                            width: '80px',
                                            height: '80px',
                                            background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)'
                                        }}
                                    >
                                        <i className="bi bi-people fs-1 text-primary"></i>
                                    </div>
                                    <h6 className="fw-semibold" style={{ color: darkMode ? '#f8fafc' : '#1a1f36' }}>No patients yet</h6>
                                    <p className="small mb-3" style={{ color: darkMode ? 'rgba(255,255,255,0.6)' : '#64748b' }}>Start by registering your first patient</p>
                                    <Link
                                        to="/patients"
                                        className="btn btn-primary"
                                        style={{ borderRadius: '10px' }}
                                    >
                                        <i className="bi bi-plus-circle me-2"></i>
                                        Add Patient
                                    </Link>
                                </div>
                            ) : (
                                <div className="table-responsive">
                                    <table className="table table-hover mb-0" style={{
                                        color: darkMode ? '#f8fafc' : undefined,
                                        '--bs-table-bg': darkMode ? '#1e293b' : undefined,
                                        '--bs-table-hover-bg': darkMode ? 'rgba(255,255,255,0.05)' : undefined,
                                        '--bs-table-striped-bg': darkMode ? 'rgba(255,255,255,0.03)' : undefined
                                    }}>
                                        <thead>
                                            <tr>
                                                <th className="border-0 ps-4 py-3 small fw-semibold" style={{ color: darkMode ? 'rgba(255,255,255,0.6)' : '#64748b' }}>PATIENT</th>
                                                <th className="border-0 py-3 small fw-semibold" style={{ color: darkMode ? 'rgba(255,255,255,0.6)' : '#64748b' }}>AGE</th>
                                                <th className="border-0 py-3 small fw-semibold" style={{ color: darkMode ? 'rgba(255,255,255,0.6)' : '#64748b' }}>GENDER</th>
                                                <th className="border-0 py-3 small fw-semibold" style={{ color: darkMode ? 'rgba(255,255,255,0.6)' : '#64748b' }}>CONTACT</th>
                                                <th className="border-0 pe-4 py-3 small fw-semibold text-end" style={{ color: darkMode ? 'rgba(255,255,255,0.6)' : '#64748b' }}>ACTION</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recentPatients.map((patient) => {
                                                const initials = patient.name
                                                    .split(' ')
                                                    .map(n => n[0])
                                                    .join('')
                                                    .toUpperCase()
                                                    .substring(0, 2);

                                                return (
                                                    <tr
                                                        key={patient.id}
                                                        style={{
                                                            cursor: 'pointer'
                                                        }}
                                                        onClick={() => navigate(`/patients/${patient.id}`)}
                                                    >
                                                        <td className="ps-4 py-3">
                                                            <div className="d-flex align-items-center gap-3">
                                                                <div
                                                                    className="rounded-circle d-flex align-items-center justify-content-center text-white fw-semibold"
                                                                    style={{
                                                                        width: '42px',
                                                                        height: '42px',
                                                                        background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
                                                                        fontSize: '14px'
                                                                    }}
                                                                >
                                                                    {initials}
                                                                </div>
                                                                <div>
                                                                    <div className="fw-semibold" style={{ color: darkMode ? '#f8fafc' : '#1a1f36' }}>{patient.name}</div>
                                                                    <small style={{ color: darkMode ? 'rgba(255,255,255,0.5)' : '#6c757d' }}>ID: {patient.id?.substring(0, 8)}...</small>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="py-3">
                                                            <span className="fw-medium" style={{ color: darkMode ? '#f8fafc' : undefined }}>{patient.age || 'N/A'} yrs</span>
                                                        </td>
                                                        <td className="py-3">
                                                            <span className={`badge rounded-pill ${patient.gender === 'Male' ? 'bg-primary' : 'bg-danger'} bg-opacity-10 ${patient.gender === 'Male' ? 'text-primary' : 'text-danger'}`}>
                                                                {patient.gender}
                                                            </span>
                                                        </td>
                                                        <td className="py-3">
                                                            <div className="d-flex align-items-center gap-2">
                                                                <i className="bi bi-telephone" style={{ color: darkMode ? 'rgba(255,255,255,0.5)' : '#94a3b8' }}></i>
                                                                <span style={{ color: darkMode ? '#f8fafc' : undefined }}>{patient.mobile || 'No phone'}</span>
                                                            </div>
                                                        </td>
                                                        <td className="pe-4 py-3 text-end">
                                                            <button
                                                                className="btn btn-sm btn-outline-primary"
                                                                style={{ borderRadius: '8px' }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    navigate(`/patients/${patient.id}`);
                                                                }}
                                                            >
                                                                <i className="bi bi-eye me-1"></i>
                                                                View
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default Dashboard;
