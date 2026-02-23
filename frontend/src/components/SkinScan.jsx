import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import apiService from '../services/apiService';
import './SkinScan.css';
import { useDarkMode } from '../context/DarkModeContext';
import jeevanAlertLogo from '../assets/jeevanalert.svg';

function SkinScan() {
    const navigate = useNavigate();
    const location = useLocation();
    const fileInputRef = useRef(null);
    const { darkMode } = useDarkMode();

    const [userName, setUserName] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(true);

    // Upload state
    const [selectedImage, setSelectedImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [isDragging, setIsDragging] = useState(false);

    // Metadata state
    const [age, setAge] = useState('');
    const [sex, setSex] = useState('');
    const [anatomicalSite, setAnatomicalSite] = useState('');
    const [sizeMm, setSizeMm] = useState('');

    // Analysis state
    const [analyzing, setAnalyzing] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [modelStatus, setModelStatus] = useState(null);

    useEffect(() => {
        const staffId = localStorage.getItem('staffId');
        if (!staffId) {
            navigate('/');
            return;
        }

        const name = localStorage.getItem('userName') || 'CHW User';
        setUserName(name);
        checkModelStatus();
    }, [navigate]);

    const checkModelStatus = async () => {
        try {
            const status = await apiService.getSkinAnalysisStatus();
            setModelStatus(status);
        } catch (error) {
            console.error('Failed to check model status:', error);
            setModelStatus({ available: false, message: 'Model status unknown' });
        }
    };

    const handleLogout = () => {
        localStorage.clear();
        navigate('/');
    };

    const isActive = (path) => location.pathname === path;

    // Image upload handlers
    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        processFile(file);
    };

    const handleDrop = (event) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files[0];
        processFile(file);
    };

    const handleDragOver = (event) => {
        event.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const processFile = (file) => {
        if (!file) return;

        // Validate file type
        if (!file.type.match('image/(jpeg|jpg|png)')) {
            setError('Please upload a JPEG or PNG image');
            return;
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            setError('Image must be smaller than 10MB');
            return;
        }

        setSelectedImage(file);
        setError(null);
        setResult(null);

        // Create preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const handleAnalyze = async () => {
        if (!selectedImage) {
            setError('Please select an image first');
            return;
        }

        setAnalyzing(true);
        setError(null);

        try {
            const metadata = {};
            if (age) metadata.age = parseInt(age);
            if (sex) metadata.sex = sex;
            if (anatomicalSite) metadata.site = anatomicalSite;
            if (sizeMm) metadata.size_mm = parseFloat(sizeMm);

            const analysisResult = await apiService.analyzeSkinLesion(selectedImage, metadata);
            setResult(analysisResult);
        } catch (error) {
            console.error('Analysis failed:', error);
            setError(error.message || 'Analysis failed. Please try again.');
        } finally {
            setAnalyzing(false);
        }
    };

    const handleNewAnalysis = () => {
        setSelectedImage(null);
        setImagePreview(null);
        setResult(null);
        setError(null);
        setAge('');
        setSex('');
        setAnatomicalSite('');
        setSizeMm('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const getClassificationColor = (classification) => {
        if (classification === 'benign') return 'success';
        if (classification === 'malignant') return 'danger';
        return 'warning';
    };

    const getUrgencyBadge = (urgency) => {
        const colors = {
            'high': 'danger',
            'medium': 'warning',
            'low': 'info'
        };
        return colors[urgency] || 'secondary';
    };

    return (
        <div className="skin-scan-page d-flex min-vh-100" style={{
            background: darkMode
                ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
                : 'linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%)'
        }}>
            {/* Modern Sidebar */}
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
                        <span className="text-uppercase text-white-50 small fw-semibold">Main Menu</span>
                    </div>

                    <Link
                        to="/dashboard"
                        className="d-flex align-items-center gap-3 px-3 py-2 text-decoration-none rounded-3 mb-1"
                        style={{
                            background: isActive('/dashboard') ? 'rgba(20, 184, 166, 0.15)' : 'transparent',
                            color: isActive('/dashboard') ? '#14B8A6' : 'rgba(255,255,255,0.7)',
                            transition: 'all 0.2s ease',
                            borderLeft: isActive('/dashboard') ? '3px solid #14B8A6' : '3px solid transparent',
                            paddingLeft: '16px'
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
                    >
                        <i className="bi bi-people-fill" style={{ fontSize: '1.1rem' }}></i>
                        <span className="fw-medium" style={{ fontSize: '0.95rem' }}>Patients</span>
                    </Link>

                    <Link
                        to="/charma-scan"
                        className="d-flex align-items-center gap-3 px-3 py-2 text-decoration-none rounded-3 mb-1"
                        style={{
                            background: isActive('/charma-scan') ? 'rgba(20, 184, 166, 0.15)' : 'transparent',
                            color: isActive('/charma-scan') ? '#14B8A6' : 'rgba(255,255,255,0.7)',
                            transition: 'all 0.2s ease',
                            borderLeft: isActive('/charma-scan') ? '3px solid #14B8A6' : '3px solid transparent',
                            paddingLeft: '16px'
                        }}
                    >
                        <i className="bi bi-search" style={{ fontSize: '1.1rem' }}></i>
                        <span className="fw-medium flex-grow-1" style={{ fontSize: '0.95rem' }}>Charma Scan</span>
                        <span className="badge" style={{
                            background: isActive('/charma-scan') ? 'rgba(20, 184, 166, 0.3)' : 'rgba(255,255,255,0.1)',
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
                                    <i className="bi bi-search me-2" style={{ color: '#EC4899' }}></i>
                                    Charma Scan - Skin Lesion Analysis
                                </h4>
                                <p className="mb-0 small mt-1" style={{ color: darkMode ? 'rgba(255,255,255,0.6)' : '#64748b' }}>
                                    AI-powered dermatology analysis
                                    {modelStatus && (
                                        <span className={`badge ms-2 ${modelStatus.available ? 'bg-success' : 'bg-warning'}`}>
                                            {modelStatus.available ? 'Model Ready' : 'Demo Mode'}
                                        </span>
                                    )}
                                </p>
                            </div>
                            <Link
                                to="/dashboard"
                                className={`btn d-flex align-items-center gap-2 ${darkMode ? 'btn-outline-light' : 'btn-outline-secondary'}`}
                                style={{ borderRadius: '10px' }}
                            >
                                <i className="bi bi-arrow-left"></i>
                                Back to Dashboard
                            </Link>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <div className="container-fluid p-4">
                    <div className="row g-4">
                        {/* Left Column - Upload & Metadata */}
                        <div className="col-12 col-lg-5">
                            {/* Upload Card */}
                            <div className="card border-0 mb-4" style={{ borderRadius: '16px', boxShadow: darkMode ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.08)', background: darkMode ? '#1e293b' : 'white' }}>
                                <div
                                    className="card-header text-white border-0 p-4"
                                    style={{
                                        background: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
                                        borderRadius: '16px 16px 0 0'
                                    }}
                                >
                                    <h5 className="mb-0 fw-bold">
                                        <i className="bi bi-camera-fill me-2"></i>
                                        Upload Skin Image
                                    </h5>
                                </div>
                                <div className="card-body p-4" style={{ background: darkMode ? '#1e293b' : 'white', borderRadius: '0 0 16px 16px' }}>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/jpg,image/png"
                                        onChange={handleFileSelect}
                                        style={{ display: 'none' }}
                                    />

                                    {!imagePreview ? (
                                        <div
                                            className={`upload-zone ${isDragging ? 'dragging' : ''} ${darkMode ? 'dark' : ''}`}
                                            onClick={() => fileInputRef.current?.click()}
                                            onDrop={handleDrop}
                                            onDragOver={handleDragOver}
                                            onDragLeave={handleDragLeave}
                                        >
                                            <div>
                                                <i className="bi bi-cloud-arrow-up fs-1 mb-3 d-block" style={{ color: darkMode ? 'rgba(255,255,255,0.4)' : '#6c757d' }}></i>
                                                <p className="mb-2 fw-medium" style={{ color: darkMode ? '#f8fafc' : undefined }}>Click to upload or drag and drop</p>
                                                <p className="small mb-0" style={{ color: darkMode ? 'rgba(255,255,255,0.5)' : '#6c757d' }}>JPEG or PNG (max 10MB)</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className={`upload-zone ${darkMode ? 'dark' : ''}`} style={{ borderColor: '#EC4899', borderStyle: 'solid' }}>
                                            <img src={imagePreview} alt="Preview" className="img-fluid" />
                                        </div>
                                    )}

                                    {imagePreview && (
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="btn btn-outline-secondary btn-sm mt-3 w-100"
                                        >
                                            <i className="bi bi-arrow-repeat me-2"></i>
                                            Change Image
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Metadata Card */}
                            <div className="card border-0" style={{ borderRadius: '16px', boxShadow: darkMode ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.08)', background: darkMode ? '#1e293b' : 'white' }}>
                                <div className="border-0 p-4" style={{ borderRadius: '16px 16px 0 0', background: darkMode ? '#253046' : '#f8f9fa' }}>
                                    <h6 className="mb-0 fw-bold" style={{ color: darkMode ? '#f8fafc' : '#1a1f36' }}>
                                        <i className="bi bi-info-circle me-2"></i>
                                        Patient Metadata (Optional)
                                    </h6>
                                </div>
                                <div className="card-body p-4" style={{ background: darkMode ? '#1e293b' : 'white', borderRadius: '0 0 16px 16px' }}>
                                    <div className="mb-3">
                                        <label className="form-label fw-medium small" style={{ color: darkMode ? '#cbd5e1' : undefined }}>Age (years)</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            value={age}
                                            onChange={(e) => setAge(e.target.value)}
                                            placeholder="e.g., 45"
                                            min="0"
                                            max="120"
                                            style={darkMode ? { background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#f8fafc' } : {}}
                                        />
                                    </div>

                                    <div className="mb-3">
                                        <label className="form-label fw-medium small" style={{ color: darkMode ? '#cbd5e1' : undefined }}>Sex</label>
                                        <select
                                            className="form-select"
                                            value={sex}
                                            onChange={(e) => setSex(e.target.value)}
                                            style={darkMode ? { background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#f8fafc' } : {}}
                                        >
                                            <option value="">Select...</option>
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                        </select>
                                    </div>

                                    <div className="mb-3">
                                        <label className="form-label fw-medium small" style={{ color: darkMode ? '#cbd5e1' : undefined }}>Anatomical Site</label>
                                        <select
                                            className="form-select"
                                            value={anatomicalSite}
                                            onChange={(e) => setAnatomicalSite(e.target.value)}
                                            style={darkMode ? { background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#f8fafc' } : {}}
                                        >
                                            <option value="">Select...</option>
                                            <option value="head/neck">Head/Neck</option>
                                            <option value="upper extremity">Upper Extremity</option>
                                            <option value="lower extremity">Lower Extremity</option>
                                            <option value="anterior torso">Anterior Torso</option>
                                            <option value="posterior torso">Posterior Torso</option>
                                            <option value="palms/soles">Palms/Soles</option>
                                            <option value="lateral torso">Lateral Torso</option>
                                            <option value="oral/genital">Oral/Genital</option>
                                        </select>
                                    </div>

                                    <div className="mb-3">
                                        <label className="form-label fw-medium small" style={{ color: darkMode ? '#cbd5e1' : undefined }}>Lesion Size (mm)</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            value={sizeMm}
                                            onChange={(e) => setSizeMm(e.target.value)}
                                            placeholder="e.g., 5.2"
                                            step="0.1"
                                            min="0"
                                            style={darkMode ? { background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#f8fafc' } : {}}
                                        />
                                    </div>

                                    {!result ? (
                                        <button
                                            onClick={handleAnalyze}
                                            disabled={!selectedImage || analyzing}
                                            className="btn text-white w-100 py-3 fw-medium"
                                            style={{
                                                background: selectedImage && !analyzing ?
                                                    'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)' : '#ccc',
                                                border: 'none',
                                                borderRadius: '12px',
                                                boxShadow: selectedImage && !analyzing ?
                                                    '0 4px 12px rgba(236, 72, 153, 0.3)' : 'none'
                                            }}
                                        >
                                            {analyzing ? (
                                                <>
                                                    <span className="spinner-border spinner-border-sm me-2"></span>
                                                    Analyzing...
                                                </>
                                            ) : (
                                                <>
                                                    <i className="bi bi-lightning-charge-fill me-2"></i>
                                                    Analyze Lesion
                                                </>
                                            )}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleNewAnalysis}
                                            className="btn btn-outline-secondary w-100 py-3 fw-medium"
                                            style={{ borderRadius: '12px' }}
                                        >
                                            <i className="bi bi-arrow-repeat me-2"></i>
                                            New Analysis
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right Column - Results */}
                        <div className="col-12 col-lg-7">
                            {error && (
                                <div className="alert alert-danger d-flex align-items-center mb-4" style={{ borderRadius: '12px' }}>
                                    <i className="bi bi-exclamation-triangle-fill fs-4 me-3"></i>
                                    <div>
                                        <strong>Error:</strong> {error}
                                    </div>
                                </div>
                            )}

                            {!result && !analyzing && (
                                <div className="card border-0 text-center" style={{ borderRadius: '16px', boxShadow: darkMode ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.08)', background: darkMode ? '#1e293b' : 'white' }}>
                                    <div className="card-body p-5">
                                        <div
                                            className="rounded-circle mx-auto mb-4 d-flex align-items-center justify-content-center"
                                            style={{
                                                width: '120px',
                                                height: '120px',
                                                background: 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)'
                                            }}
                                        >
                                            <i className="bi bi-search fs-1" style={{ color: '#EC4899' }}></i>
                                        </div>
                                        <h5 className="fw-bold mb-3" style={{ color: darkMode ? '#f8fafc' : '#1a1f36' }}>
                                            Charma Scan Ready
                                        </h5>
                                        <p className="mb-0" style={{ color: darkMode ? 'rgba(255,255,255,0.6)' : '#6c757d' }}>
                                            Upload a skin lesion image to begin AI-powered analysis.
                                            Our model can help identify potential skin conditions.
                                        </p>
                                        <div className="mt-4 pt-4" style={{ borderTop: darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid #dee2e6' }}>
                                            <div className="row g-3 text-start">
                                                <div className="col-12">
                                                    <div className="d-flex gap-3">
                                                        <i className="bi bi-check-circle-fill text-success"></i>
                                                        <small style={{ color: darkMode ? 'rgba(255,255,255,0.6)' : '#6c757d' }}>MedGemma-based vision model</small>
                                                    </div>
                                                </div>
                                                <div className="col-12">
                                                    <div className="d-flex gap-3">
                                                        <i className="bi bi-check-circle-fill text-success"></i>
                                                        <small style={{ color: darkMode ? 'rgba(255,255,255,0.6)' : '#6c757d' }}>Trained on medical imaging dataset</small>
                                                    </div>
                                                </div>
                                                <div className="col-12">
                                                    <div className="d-flex gap-3">
                                                        <i className="bi bi-check-circle-fill text-success"></i>
                                                        <small style={{ color: darkMode ? 'rgba(255,255,255,0.6)' : '#6c757d' }}>Benign vs malignant classification</small>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {analyzing && (
                                <div className="card border-0 text-center" style={{ borderRadius: '16px', boxShadow: darkMode ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.08)', background: darkMode ? '#1e293b' : 'white' }}>
                                    <div className="card-body p-5">
                                        <div className="spinner-border mb-4" style={{ width: '3rem', height: '3rem', color: '#EC4899' }}>
                                            <span className="visually-hidden">Analyzing...</span>
                                        </div>
                                        <h5 className="fw-bold mb-2" style={{ color: darkMode ? '#f8fafc' : '#1a1f36' }}>
                                            Analyzing Lesion...
                                        </h5>
                                        <p style={{ color: darkMode ? 'rgba(255,255,255,0.6)' : '#6c757d' }}>
                                            Our AI is processing your image. This may take a moment.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {result && (
                                <>
                                    {/* Classification Result */}
                                    <div className="card border-0 mb-4" style={{ borderRadius: '16px', boxShadow: darkMode ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.08)', background: darkMode ? '#1e293b' : 'white' }}>
                                        <div
                                            className={`card-header text-white border-0 p-4 bg-${getClassificationColor(result.classification)}`}
                                            style={{ borderRadius: '16px 16px 0 0' }}
                                        >
                                            <h5 className="mb-0 fw-bold">
                                                <i className={`bi bi-${result.classification === 'benign' ? 'check-circle' : 'exclamation-triangle'}-fill me-2`}></i>
                                                Classification Result
                                            </h5>
                                        </div>
                                        <div className="card-body p-4" style={{ background: darkMode ? '#1e293b' : 'white', borderRadius: '0 0 16px 16px' }}>
                                            <div className="text-center mb-4">
                                                <div
                                                    className="display-1 fw-bold mb-2"
                                                    style={{ color: result.classification === 'benign' ? '#198754' : '#dc3545' }}
                                                >
                                                    {(result.confidence * 100).toFixed(1)}%
                                                </div>
                                                <h4 className="fw-bold text-capitalize mb-3" style={{ color: darkMode ? '#f8fafc' : undefined }}>
                                                    {result.classification}
                                                </h4>
                                                {result.urgency && (
                                                    <span className={`badge bg-${getUrgencyBadge(result.urgency)} px-3 py-2`}>
                                                        {result.urgency.toUpperCase()} URGENCY
                                                    </span>
                                                )}
                                            </div>
                                            <div className="progress mb-2" style={{ height: '8px' }}>
                                                <div
                                                    className={`progress-bar bg-${getClassificationColor(result.classification)}`}
                                                    style={{ width: `${result.confidence * 100}%` }}
                                                ></div>
                                            </div>
                                            <small style={{ color: darkMode ? 'rgba(255,255,255,0.5)' : '#6c757d' }}>
                                                Model: {result.model || 'MedGemma + SigLIP'}
                                            </small>
                                        </div>
                                    </div>

                                    {/* Reasoning */}
                                    <div className="card border-0 mb-4" style={{ borderRadius: '16px', boxShadow: darkMode ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.08)', background: darkMode ? '#1e293b' : 'white' }}>
                                        <div className="border-0 p-4" style={{ borderRadius: '16px 16px 0 0', background: darkMode ? '#253046' : '#f8f9fa' }}>
                                            <h6 className="mb-0 fw-bold" style={{ color: darkMode ? '#f8fafc' : '#1a1f36' }}>
                                                <i className="bi bi-lightbulb me-2"></i>
                                                AI Reasoning
                                            </h6>
                                        </div>
                                        <div className="card-body p-4" style={{ background: darkMode ? '#1e293b' : 'white', borderRadius: '0 0 16px 16px' }}>
                                            <p className="mb-0" style={{ color: darkMode ? '#cbd5e1' : undefined }}>{result.reasoning || 'Analysis complete.'}</p>
                                        </div>
                                    </div>

                                    {/* Referral Recommendation */}
                                    {result.requires_referral && (
                                        <div
                                            className="card border-0 mb-4"
                                            style={{
                                                borderRadius: '16px',
                                                boxShadow: darkMode ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.08)',
                                                borderLeft: '5px solid #dc3545',
                                                background: darkMode ? '#1e293b' : 'white'
                                            }}
                                        >
                                            <div className="card-body p-4">
                                                <h6 className="fw-bold text-danger mb-3">
                                                    <i className="bi bi-hospital me-2"></i>
                                                    Dermatologist Referral Recommended
                                                </h6>
                                                <p className="mb-0" style={{ color: darkMode ? 'rgba(255,255,255,0.6)' : '#6c757d' }}>
                                                    Based on this analysis, we recommend referring the patient to a dermatologist
                                                    for professional examination and potential biopsy.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Medical Disclaimer */}
                                    <div className="alert alert-warning d-flex align-items-start" style={{ borderRadius: '12px' }}>
                                        <i className="bi bi-info-circle-fill fs-5 me-3 mt-1"></i>
                                        <div>
                                            <strong>Medical Disclaimer:</strong> This AI analysis is for screening purposes only
                                            and should not replace professional medical diagnosis. Always consult with a qualified
                                            healthcare provider for definitive diagnosis and treatment.
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default SkinScan;
