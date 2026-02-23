import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import apiService from '../services/apiService';
import NewEncounter from './NewEncounter';
import { useDarkMode } from '../context/DarkModeContext';
import './Patients.css';
import jeevanAlertLogo from '../assets/jeevanalert.svg';

function Patients() {
    const navigate = useNavigate();
    const location = useLocation();
    const { darkMode, toggleDarkMode } = useDarkMode();
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showNewPatientModal, setShowNewPatientModal] = useState(false);
    const [showNewEncounter, setShowNewEncounter] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [userName] = useState(() => localStorage.getItem('userName') || 'CHW User');
    const [newPatient, setNewPatient] = useState({
        name: '',
        age: '',
        date_of_birth: '1990-01-01',
        gender: 'Male',
        mobile: '',
        email: '',
        medical_history: '',
        allergies: '',
        height_cm: '',
        weight_kg: '',
        address: {
            line1: '',
            line2: '',
            city: '',
            state: '',
            zipCode: '',
            country: ''
        }
    });

    useEffect(() => {
        loadPatients();
    }, []);

    const loadPatients = async () => {
        try {
            setLoading(true);
            const data = await apiService.getPatients();
            setPatients(data.patients || []);
        } catch (error) {
            console.error('Failed to load patients:', error);
            setPatients([]);
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePatient = async (e) => {
        e.preventDefault();
        try {
            const patientData = {
                name: newPatient.name,
                gender: newPatient.gender,
                mobile: newPatient.mobile,
            };

            if (newPatient.age && newPatient.age !== '') patientData.age = parseInt(newPatient.age);
            if (newPatient.date_of_birth) patientData.date_of_birth = newPatient.date_of_birth;
            if (newPatient.email) patientData.email = newPatient.email;
            if (newPatient.allergies) patientData.allergies = newPatient.allergies;
            if (newPatient.medical_history) patientData.medical_history = newPatient.medical_history;
            if (newPatient.height_cm && newPatient.height_cm !== '') patientData.height_cm = parseFloat(newPatient.height_cm);
            if (newPatient.weight_kg && newPatient.weight_kg !== '') patientData.weight_kg = parseFloat(newPatient.weight_kg);

            if (newPatient.address && (newPatient.address.line1 || newPatient.address.city)) {
                patientData.address = {
                    line1: newPatient.address.line1 || null,
                    line2: newPatient.address.line2 || null,
                    city: newPatient.address.city || null,
                    state: newPatient.address.state || null,
                    zipCode: newPatient.address.zipCode || null,
                    country: newPatient.address.country || null,
                };
            }

            await apiService.createPatient(patientData);
            setShowNewPatientModal(false);
            setNewPatient({
                name: '', age: '', date_of_birth: '1990-01-01', gender: 'Male', mobile: '', email: '',
                medical_history: '', allergies: '', height_cm: '', weight_kg: '',
                address: { line1: '', line2: '', city: '', state: '', zipCode: '', country: '' }
            });
            loadPatients();
        } catch (error) {
            console.error('Patient creation error:', error);
            alert('Failed to create patient: ' + (error.message || 'Unknown error'));
        }
    };

    const handleStartEncounter = (patient) => {
        setSelectedPatient(patient);
        setShowNewEncounter(true);
    };

    const handleEncounterComplete = () => {
        setShowNewEncounter(false);
        setSelectedPatient(null);
        loadPatients();
    };

    const handleLogout = () => {
        localStorage.clear();
        navigate('/');
    };

    const filteredPatients = patients.filter(p =>
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.mobile?.includes(searchTerm)
    );

    const calculateAge = (patient) => {
        if (patient.age != null) return patient.age;
        const dob = patient.date_of_birth;
        if (!dob) return 'N/A';
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
        return age;
    };

    const getAvatarColor = (name) => {
        const colors = [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
            'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
            'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)'
        ];
        const index = name?.charCodeAt(0) % colors.length || 0;
        return colors[index];
    };

    const isActive = (path) => location.pathname === path;

    // Sidebar nav link helper
    const navLink = (to, icon, label, badge = null, badgeActive = null) => (
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
                    background: isActive(to) ? (badgeActive || 'rgba(20, 184, 166, 0.3)') : 'rgba(255,255,255,0.1)',
                    fontSize: '0.65rem',
                    padding: '3px 6px',
                    fontWeight: '600'
                }}>{badge}</span>
            )}
        </Link>
    );

    return (
        <div className="pts-page" style={{
            background: darkMode
                ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
                : 'linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%)',
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
                <nav className="flex-grow-1 py-4 px-2">
                    <div className="px-3 mb-3">
                        <span className="text-uppercase small fw-semibold" style={{
                            color: 'rgba(255,255,255,0.4)',
                            letterSpacing: '0.5px',
                            fontSize: '0.7rem'
                        }}>MAIN MENU</span>
                    </div>

                    {navLink('/dashboard', 'bi-grid-1x2-fill', 'Dashboard')}
                    {navLink('/patients', 'bi-people-fill', 'Patients')}
                    {navLink('/charma-scan', 'bi-search', 'Charma Scan', 'AI', 'rgba(236, 72, 153, 0.3)')}
                    {navLink('/analytics', 'bi-bar-chart-line-fill', 'Analytics')}
                </nav>

                {/* User Profile */}
                <div className="p-3 border-top" style={{ borderColor: 'rgba(255,255,255,0.1) !important' }}>
                    <div className="d-flex align-items-center gap-3 p-2 rounded-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div
                            className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold"
                            style={{
                                width: '40px', height: '40px',
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

            {/* ====== MAIN CONTENT ====== */}
            <main className="pts-main">
                {/* Top Bar */}
                <header className={`pts-topbar ${darkMode ? 'pts-topbar-dark' : 'pts-topbar-light'}`}>
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
                                    <i className="bi bi-people-fill me-2" style={{ color: '#14B8A6' }}></i>
                                    Patient Management
                                </h4>
                                <p className="mb-0 small mt-1" style={{ color: darkMode ? 'rgba(255,255,255,0.5)' : '#64748b' }}>
                                    View, search, and manage your patient records
                                </p>
                            </div>
                            <div className="d-flex gap-2 align-items-center">
                                {/* Dark Mode Toggle */}
                                <button
                                    onClick={toggleDarkMode}
                                    className="btn d-flex align-items-center justify-content-center"
                                    style={{
                                        width: '44px', height: '44px',
                                        background: darkMode ? 'rgba(255,255,255,0.1)' : '#f1f5f9',
                                        border: 'none', borderRadius: '12px',
                                        color: darkMode ? '#fbbf24' : '#64748b',
                                        transition: 'all 0.3s ease'
                                    }}
                                    title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                                >
                                    <i className={`bi ${darkMode ? 'bi-sun-fill' : 'bi-moon-fill'} fs-5`}></i>
                                </button>
                                {/* Add Patient */}
                                <button className="pts-add-btn" onClick={() => setShowNewPatientModal(true)}>
                                    <i className="bi bi-person-plus-fill"></i>
                                    <span className="d-none d-sm-inline">Add Patient</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Content */}
                <div className="container-fluid p-4">
                    {/* Stats */}
                    <div className="pts-stats-row">
                        <div className="pts-stat pts-stat--blue">
                            <div className="d-flex justify-content-between align-items-start mb-3">
                                <div className="pts-stat-icon">
                                    <i className="bi bi-people-fill"></i>
                                </div>
                            </div>
                            <div className="pts-stat-value">{patients.length}</div>
                            <div className="pts-stat-label">Total Patients</div>
                        </div>
                        <div className="pts-stat pts-stat--green">
                            <div className="d-flex justify-content-between align-items-start mb-3">
                                <div className="pts-stat-icon">
                                    <i className="bi bi-check-circle-fill"></i>
                                </div>
                            </div>
                            <div className="pts-stat-value">{patients.filter(p => p.active !== false).length}</div>
                            <div className="pts-stat-label">Active Patients</div>
                        </div>
                        <div className="pts-stat pts-stat--orange">
                            <div className="d-flex justify-content-between align-items-start mb-3">
                                <div className="pts-stat-icon">
                                    <i className="bi bi-search"></i>
                                </div>
                            </div>
                            <div className="pts-stat-value">{filteredPatients.length}</div>
                            <div className="pts-stat-label">Search Results</div>
                        </div>
                    </div>

                    {/* Search & View Toggle */}
                    <div className={`pts-search-bar ${darkMode ? 'pts-search-bar-dark' : 'pts-search-bar-light'}`}>
                        <div className="pts-search-input-wrap">
                            <i className={`bi bi-search pts-search-icon ${darkMode ? 'text-white-50' : 'text-muted'}`}></i>
                            <input
                                type="text"
                                className={`pts-search-input ${darkMode ? 'pts-search-input-dark' : 'pts-search-input-light'}`}
                                placeholder="Search by patient name or phone number..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="d-flex gap-2">
                            <button
                                className={`pts-view-btn ${viewMode === 'grid' ? 'pts-view-btn--active' : (darkMode ? 'pts-view-btn--inactive-dark' : 'pts-view-btn--inactive-light')}`}
                                onClick={() => setViewMode('grid')}
                                title="Grid view"
                            >
                                <i className="bi bi-grid-3x3-gap-fill"></i>
                            </button>
                            <button
                                className={`pts-view-btn ${viewMode === 'list' ? 'pts-view-btn--active' : (darkMode ? 'pts-view-btn--inactive-dark' : 'pts-view-btn--inactive-light')}`}
                                onClick={() => setViewMode('list')}
                                title="List view"
                            >
                                <i className="bi bi-list-ul"></i>
                            </button>
                        </div>
                    </div>

                    {/* Patient Display */}
                    {loading ? (
                        <div className="pts-loading">
                            <div className="spinner-border" style={{ width: '2.5rem', height: '2.5rem', color: '#14B8A6' }} role="status">
                                <span className="visually-hidden">Loading...</span>
                            </div>
                            <p style={{ color: darkMode ? 'rgba(255,255,255,0.5)' : '#64748b', fontSize: '0.95rem' }}>Loading patients...</p>
                        </div>
                    ) : filteredPatients.length === 0 ? (
                        <div className="pts-empty">
                            <div className={`pts-empty-icon ${darkMode ? 'pts-empty-icon-dark' : 'pts-empty-icon-light'}`}>
                                <i className="bi bi-people"></i>
                            </div>
                            <h3 className="fw-bold mb-2" style={{ color: darkMode ? '#f8fafc' : '#1e293b' }}>No Patients Found</h3>
                            <p className="mb-4" style={{ color: darkMode ? 'rgba(255,255,255,0.5)' : '#64748b', maxWidth: '360px', margin: '0 auto 1.5rem' }}>
                                {searchTerm ? 'Try a different search term' : 'Get started by adding your first patient'}
                            </p>
                            {!searchTerm && (
                                <button className="pts-add-btn pts-empty-cta" onClick={() => setShowNewPatientModal(true)}>
                                    <i className="bi bi-person-plus-fill"></i> Add First Patient
                                </button>
                            )}
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div className="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-4 mb-4">
                            {filteredPatients.map((patient) => {
                                const age = calculateAge(patient);
                                const initials = patient.name?.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) || '??';
                                return (
                                    <div key={patient.id} className="col">
                                        <div className={`pts-patient-card h-100 ${darkMode ? 'pts-patient-card-dark' : 'pts-patient-card-light'}`}>
                                            <div className="p-4">
                                                <div className="d-flex align-items-start gap-3 mb-3">
                                                    <div className="pts-avatar" style={{ backgroundImage: getAvatarColor(patient.name), backgroundColor: '#667eea' }}>
                                                        {initials}
                                                    </div>
                                                    <div style={{ minWidth: 0, flex: 1 }}>
                                                        <h6 className="fw-bold mb-1" style={{ color: darkMode ? '#f8fafc' : '#1e293b', fontSize: '1.05rem' }}>{patient.name}</h6>
                                                        <div style={{ fontSize: '0.73rem', color: darkMode ? 'rgba(255,255,255,0.4)' : '#94a3b8', fontFamily: 'monospace' }}>
                                                            ID: {patient.id?.substring(0, 8)}
                                                        </div>
                                                    </div>
                                                    <span className={`pts-pill ${darkMode ? 'pts-pill-dark' : ''}`} style={{
                                                        background: 'rgba(34, 197, 94, 0.1)',
                                                        color: '#16a34a',
                                                        fontSize: '0.7rem'
                                                    }}>
                                                        <i className="bi bi-circle-fill" style={{ fontSize: '0.4rem' }}></i> Active
                                                    </span>
                                                </div>

                                                <div className="d-flex flex-wrap gap-2 mb-3">
                                                    <span className={`pts-pill ${darkMode ? 'pts-pill-dark' : 'pts-pill-light'}`}>
                                                        <i className="bi bi-calendar3"></i> {age} yrs
                                                    </span>
                                                    <span className={`pts-pill ${darkMode ? 'pts-pill-dark' : 'pts-pill-light'}`}>
                                                        <i className={`bi ${patient.gender === 'Male' ? 'bi-gender-male' : 'bi-gender-female'}`}></i> {patient.gender}
                                                    </span>
                                                </div>

                                                <div className="pts-contact mb-3" style={{ color: darkMode ? 'rgba(255,255,255,0.55)' : '#64748b' }}>
                                                    <i className="bi bi-telephone"></i> {patient.mobile || 'No phone'}
                                                </div>

                                                <div className="d-flex gap-2">
                                                    <button className="pts-action-btn pts-action-primary flex-fill" onClick={() => handleStartEncounter(patient)}>
                                                        <i className="bi bi-clipboard2-pulse"></i> Encounter
                                                    </button>
                                                    <button className={`pts-action-btn flex-fill ${darkMode ? 'pts-action-secondary-dark' : 'pts-action-secondary-light'}`} onClick={() => navigate(`/patients/${patient.id}`)}>
                                                        <i className="bi bi-eye"></i> Details
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        /* List View */
                        <div className={`pts-table-wrap ${darkMode ? 'pts-table-dark' : 'pts-table-light'}`}>
                            <div className="table-responsive">
                                <table className="table mb-0" style={{
                                    color: darkMode ? '#f8fafc' : '#1e293b',
                                    '--bs-table-bg': 'transparent',
                                    '--bs-table-hover-bg': 'transparent'
                                }}>
                                    <thead>
                                        <tr className={darkMode ? 'pts-thead-dark' : 'pts-thead-light'}>
                                            <th className="border-0 ps-4">Patient</th>
                                            <th className="border-0">Age</th>
                                            <th className="border-0">Gender</th>
                                            <th className="border-0">Phone</th>
                                            <th className="border-0 text-end pe-4">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredPatients.map((patient) => {
                                            const age = calculateAge(patient);
                                            const initials = patient.name?.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) || '??';
                                            return (
                                                <tr key={patient.id} className={darkMode ? 'pts-row-dark' : 'pts-row-light'}>
                                                    <td className="ps-4">
                                                        <div className="d-flex align-items-center gap-3">
                                                            <div className="pts-avatar-sm" style={{ backgroundImage: getAvatarColor(patient.name), backgroundColor: '#667eea' }}>
                                                                {initials}
                                                            </div>
                                                            <div>
                                                                <h6 className="mb-0 fw-semibold" style={{ color: darkMode ? '#f8fafc' : '#1e293b' }}>{patient.name}</h6>
                                                                <small style={{ color: darkMode ? 'rgba(255,255,255,0.4)' : '#94a3b8', fontFamily: 'monospace', fontSize: '0.72rem' }}>ID: {patient.id?.substring(0, 8)}</small>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="align-middle">{age} yrs</td>
                                                    <td className="align-middle">
                                                        <span className={`pts-pill ${darkMode ? 'pts-pill-dark' : 'pts-pill-light'}`}>{patient.gender}</span>
                                                    </td>
                                                    <td className="align-middle" style={{ color: darkMode ? 'rgba(255,255,255,0.6)' : '#64748b' }}>{patient.mobile || '—'}</td>
                                                    <td className="text-end pe-4 align-middle">
                                                        <button className="pts-action-btn pts-action-primary me-2" onClick={() => handleStartEncounter(patient)}>
                                                            <i className="bi bi-clipboard2-pulse"></i> Encounter
                                                        </button>
                                                        <button className={`pts-action-btn ${darkMode ? 'pts-action-secondary-dark' : 'pts-action-secondary-light'}`} onClick={() => navigate(`/patients/${patient.id}`)}>
                                                            <i className="bi bi-eye"></i> View
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* ====== NEW PATIENT MODAL ====== */}
            {showNewPatientModal && (
                <div
                    className="modal fade show d-block"
                    style={{ backgroundColor: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
                    onClick={() => setShowNewPatientModal(false)}
                >
                    <div
                        className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={`modal-content border-0 shadow-lg ${darkMode ? 'pts-modal-dark' : ''}`} style={{ borderRadius: '16px', overflow: 'hidden' }}>
                            {/* Header */}
                            <div
                                className="modal-header border-0 text-white py-4"
                                style={{ background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)' }}
                            >
                                <div className="d-flex align-items-center gap-3">
                                    <div
                                        className="rounded-circle d-flex align-items-center justify-content-center"
                                        style={{ width: '48px', height: '48px', background: 'rgba(255,255,255,0.2)' }}
                                    >
                                        <i className="bi bi-person-plus-fill fs-4"></i>
                                    </div>
                                    <div>
                                        <h5 className="modal-title mb-0 fw-bold">Add New Patient</h5>
                                        <small className="opacity-75">Enter patient details below</small>
                                    </div>
                                </div>
                                <button type="button" className="btn-close btn-close-white" onClick={() => setShowNewPatientModal(false)}></button>
                            </div>

                            {/* Body */}
                            <form onSubmit={handleCreatePatient}>
                                <div className="modal-body p-4" style={{
                                    background: darkMode ? '#0f172a' : '#f8fafc',
                                    maxHeight: '60vh',
                                    overflowY: 'auto'
                                }}>
                                    {/* Basic Info Card */}
                                    <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: '12px' }}>
                                        <div className="card-header border-0 py-3" style={{ background: darkMode ? '#1e293b' : 'white' }}>
                                            <h6 className="mb-0 fw-semibold">
                                                <i className="bi bi-person-fill text-primary me-2"></i>
                                                Basic Information
                                            </h6>
                                        </div>
                                        <div className="card-body">
                                            <div className="row g-3">
                                                <div className="col-12">
                                                    <label className="form-label fw-medium">Full Name <span className="text-danger">*</span></label>
                                                    <input type="text" className="form-control form-control-lg" value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} placeholder="Enter full name" required style={{ borderRadius: '10px' }} />
                                                </div>
                                                <div className="col-md-4">
                                                    <label className="form-label fw-medium">Age <span className="text-danger">*</span></label>
                                                    <input type="number" className="form-control" value={newPatient.age} onChange={(e) => setNewPatient({ ...newPatient, age: e.target.value })} placeholder="e.g. 35" min="0" max="150" required style={{ borderRadius: '10px' }} />
                                                </div>
                                                <div className="col-md-4">
                                                    <label className="form-label fw-medium">Date of Birth</label>
                                                    <input type="date" className="form-control" value={newPatient.date_of_birth} onChange={(e) => setNewPatient({ ...newPatient, date_of_birth: e.target.value })} style={{ borderRadius: '10px' }} />
                                                </div>
                                                <div className="col-md-4">
                                                    <label className="form-label fw-medium">Gender</label>
                                                    <select className="form-select" value={newPatient.gender} onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value })} style={{ borderRadius: '10px' }}>
                                                        <option value="Male">Male</option>
                                                        <option value="Female">Female</option>
                                                        <option value="Other">Other</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Contact Info Card */}
                                    <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: '12px' }}>
                                        <div className="card-header border-0 py-3" style={{ background: darkMode ? '#1e293b' : 'white' }}>
                                            <h6 className="mb-0 fw-semibold">
                                                <i className="bi bi-telephone-fill text-success me-2"></i>
                                                Contact Information
                                            </h6>
                                        </div>
                                        <div className="card-body">
                                            <div className="row g-3">
                                                <div className="col-md-6">
                                                    <label className="form-label fw-medium">Mobile Number <span className="text-danger">*</span></label>
                                                    <input type="tel" className="form-control" value={newPatient.mobile} onChange={(e) => setNewPatient({ ...newPatient, mobile: e.target.value })} placeholder="+1 234 567 8900" required style={{ borderRadius: '10px' }} />
                                                </div>
                                                <div className="col-md-6">
                                                    <label className="form-label fw-medium">Email (Optional)</label>
                                                    <input type="email" className="form-control" value={newPatient.email} onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })} placeholder="patient@email.com" style={{ borderRadius: '10px' }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Medical Info Card */}
                                    <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: '12px' }}>
                                        <div className="card-header border-0 py-3" style={{ background: darkMode ? '#1e293b' : 'white' }}>
                                            <h6 className="mb-0 fw-semibold">
                                                <i className="bi bi-heart-pulse-fill text-danger me-2"></i>
                                                Medical Information
                                            </h6>
                                        </div>
                                        <div className="card-body">
                                            <div className="row g-3">
                                                <div className="col-12">
                                                    <label className="form-label fw-medium">Allergies</label>
                                                    <input type="text" className="form-control" value={newPatient.allergies} onChange={(e) => setNewPatient({ ...newPatient, allergies: e.target.value })} placeholder="e.g., Penicillin, Peanuts, None" style={{ borderRadius: '10px' }} />
                                                </div>
                                                <div className="col-12">
                                                    <label className="form-label fw-medium">Medical History</label>
                                                    <textarea className="form-control" rows="2" value={newPatient.medical_history} onChange={(e) => setNewPatient({ ...newPatient, medical_history: e.target.value })} placeholder="e.g., Diabetes, Hypertension, Previous surgeries" style={{ borderRadius: '10px' }} />
                                                </div>
                                                <div className="col-md-6">
                                                    <label className="form-label fw-medium">Height (cm)</label>
                                                    <input type="number" className="form-control" value={newPatient.height_cm} onChange={(e) => setNewPatient({ ...newPatient, height_cm: e.target.value })} placeholder="170" style={{ borderRadius: '10px' }} />
                                                </div>
                                                <div className="col-md-6">
                                                    <label className="form-label fw-medium">Weight (kg)</label>
                                                    <input type="number" className="form-control" value={newPatient.weight_kg} onChange={(e) => setNewPatient({ ...newPatient, weight_kg: e.target.value })} placeholder="70" style={{ borderRadius: '10px' }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Address Card */}
                                    <div className="card border-0 shadow-sm" style={{ borderRadius: '12px' }}>
                                        <div className="card-header border-0 py-3" style={{ background: darkMode ? '#1e293b' : 'white' }}>
                                            <h6 className="mb-0 fw-semibold">
                                                <i className="bi bi-geo-alt-fill text-warning me-2"></i>
                                                Address (Optional)
                                            </h6>
                                        </div>
                                        <div className="card-body">
                                            <div className="row g-3">
                                                <div className="col-12">
                                                    <label className="form-label fw-medium">Address Line 1</label>
                                                    <input type="text" className="form-control" value={newPatient.address?.line1 || ''} onChange={(e) => setNewPatient({ ...newPatient, address: { ...newPatient.address, line1: e.target.value } })} placeholder="Street address" style={{ borderRadius: '10px' }} />
                                                </div>
                                                <div className="col-12">
                                                    <label className="form-label fw-medium">Address Line 2</label>
                                                    <input type="text" className="form-control" value={newPatient.address?.line2 || ''} onChange={(e) => setNewPatient({ ...newPatient, address: { ...newPatient.address, line2: e.target.value } })} placeholder="Apartment, suite, etc. (optional)" style={{ borderRadius: '10px' }} />
                                                </div>
                                                <div className="col-md-6">
                                                    <label className="form-label fw-medium">City</label>
                                                    <input type="text" className="form-control" value={newPatient.address?.city || ''} onChange={(e) => setNewPatient({ ...newPatient, address: { ...newPatient.address, city: e.target.value } })} placeholder="City" style={{ borderRadius: '10px' }} />
                                                </div>
                                                <div className="col-md-6">
                                                    <label className="form-label fw-medium">State</label>
                                                    <input type="text" className="form-control" value={newPatient.address?.state || ''} onChange={(e) => setNewPatient({ ...newPatient, address: { ...newPatient.address, state: e.target.value } })} placeholder="State" style={{ borderRadius: '10px' }} />
                                                </div>
                                                <div className="col-md-6">
                                                    <label className="form-label fw-medium">Zip Code</label>
                                                    <input type="text" className="form-control" value={newPatient.address?.zipCode || ''} onChange={(e) => setNewPatient({ ...newPatient, address: { ...newPatient.address, zipCode: e.target.value } })} placeholder="Zip / Postal Code" style={{ borderRadius: '10px' }} />
                                                </div>
                                                <div className="col-md-6">
                                                    <label className="form-label fw-medium">Country</label>
                                                    <input type="text" className="form-control" value={newPatient.address?.country || ''} onChange={(e) => setNewPatient({ ...newPatient, address: { ...newPatient.address, country: e.target.value } })} placeholder="Country" style={{ borderRadius: '10px' }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="modal-footer border-0 py-3 px-4" style={{ background: darkMode ? '#1e293b' : '#fff' }}>
                                    <button type="button" className="btn btn-light btn-lg px-4" onClick={() => setShowNewPatientModal(false)} style={{ borderRadius: '10px' }}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn btn-lg px-4 text-white" style={{ borderRadius: '10px', background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)', border: 'none' }}>
                                        <i className="bi bi-check-circle me-2"></i>
                                        Create Patient
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* New Encounter Modal */}
            {showNewEncounter && selectedPatient && (
                <NewEncounter
                    patientId={selectedPatient.id}
                    patientName={selectedPatient.name}
                    onComplete={handleEncounterComplete}
                    onCancel={() => {
                        setShowNewEncounter(false);
                        setSelectedPatient(null);
                    }}
                />
            )}
        </div>
    );
}

export default Patients;
