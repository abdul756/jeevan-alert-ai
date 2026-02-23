import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import apiService from '../services/apiService';
import NewEncounter from './NewEncounter';
import { generateEncounterPDF } from '../utils/generateEncounterPDF';
import { useDarkMode } from '../context/DarkModeContext';
import { WorkflowTracker, useWorkflowExecution } from './AIWorkflow';

// Helper: Parse JSON string safely
function parseJsonSafely(data) {
    if (!data) return null;
    if (typeof data === 'object') return data;
    try {
        return JSON.parse(data);
    } catch {
        return data;
    }
}

// Emergency Confirmation Dialog Component
function EmergencyConfirmationDialog({ context, onConfirm, onReject, onCancel }) {
    const [notes, setNotes] = React.useState('');
    const { darkMode } = useDarkMode();

    return (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.85)', zIndex: 9999 }}>
            <div className="modal-dialog modal-lg modal-dialog-centered">
                <div className="modal-content" style={{
                    borderRadius: '16px',
                    border: '3px solid #dc2626',
                    background: darkMode ? '#1e293b' : '#ffffff',
                    boxShadow: '0 25px 60px rgba(0,0,0,0.5)'
                }}>
                    {/* Header */}
                    <div className="modal-header text-white py-3" style={{
                        background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                        borderBottom: 'none'
                    }}>
                        <div className="d-flex align-items-center gap-2">
                            <i className="bi bi-exclamation-triangle-fill fs-3"></i>
                            <h5 className="modal-title fw-bold mb-0">Emergency Protocol Confirmation Required</h5>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="modal-body p-4" style={{
                        background: darkMode ? '#1e293b' : '#ffffff'
                    }}>
                        <div className="alert border-0 mb-4" style={{
                            background: darkMode ? 'rgba(251, 191, 36, 0.15)' : '#fef3c7',
                            color: darkMode ? '#fbbf24' : '#92400e'
                        }}>
                            <div className="d-flex align-items-start gap-2">
                                <i className="bi bi-info-circle-fill fs-5" style={{ color: darkMode ? '#fbbf24' : '#f59e0b' }}></i>
                                <div>
                                    <strong>AI Assessment:</strong> This case requires emergency intervention.
                                    Please review and confirm your clinical judgment.
                                </div>
                            </div>
                        </div>

                        {/* Clinical Context */}
                        <div className="row g-3 mb-4">
                            <div className="col-md-6">
                                <div className="p-3 rounded-3" style={{
                                    background: darkMode ? 'rgba(220, 38, 38, 0.15)' : '#fee2e2'
                                }}>
                                    <label className="fw-semibold d-block mb-2" style={{
                                        color: darkMode ? '#f87171' : '#dc2626'
                                    }}>
                                        <i className="bi bi-speedometer2 me-2"></i>
                                        Triage Level
                                    </label>
                                    <span className="badge bg-danger px-3 py-2 fs-6">{context?.triage_level || 'EMERGENCY'}</span>
                                </div>
                            </div>

                            {context?.differential_diagnoses && context.differential_diagnoses.length > 0 && (
                                <div className="col-md-6">
                                    <div className="p-3 rounded-3" style={{
                                        background: darkMode ? 'rgba(251, 191, 36, 0.12)' : '#fef3c7'
                                    }}>
                                        <label className="fw-semibold d-block mb-2" style={{
                                            color: darkMode ? '#fbbf24' : '#92400e'
                                        }}>
                                            <i className="bi bi-clipboard2-pulse me-2"></i>
                                            Suspected Conditions
                                        </label>
                                        <div className="small">
                                            {context.differential_diagnoses.slice(0, 2).map((dx, i) => (
                                                <div key={i} className="badge me-1 mb-1" style={{
                                                    background: darkMode ? 'rgba(251, 191, 36, 0.2)' : 'rgba(251, 191, 36, 0.25)',
                                                    color: darkMode ? '#fde68a' : '#78350f'
                                                }}>{dx}</div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {context?.red_flags && context.red_flags.length > 0 && (
                            <div className="mb-4">
                                <label className="fw-semibold mb-2 d-block" style={{
                                    color: darkMode ? '#f87171' : '#dc2626'
                                }}>
                                    <i className="bi bi-flag-fill me-2"></i>
                                    Red Flags Identified
                                </label>
                                <ul className="mb-0 ps-3">
                                    {context.red_flags.map((flag, i) => (
                                        <li key={i} className="mb-2" style={{ color: darkMode ? '#fca5a5' : '#dc2626' }}>
                                            <strong>{flag}</strong>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Clinical Notes Input */}
                        <div className="mb-3">
                            <label className="fw-semibold d-block mb-2" style={{
                                color: darkMode ? '#f87171' : '#dc2626'
                            }}>
                                <i className="bi bi-pencil-square me-2"></i>
                                Your Clinical Notes (Required) *
                            </label>
                            <textarea
                                className="form-control"
                                rows={5}
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Document your clinical assessment and reasoning..."
                                style={{
                                    fontSize: '0.95rem',
                                    background: darkMode ? '#0f172a' : '#ffffff',
                                    color: darkMode ? '#f1f5f9' : '#1a1f36',
                                    border: darkMode ? '1px solid rgba(255,255,255,0.15)' : '1px solid #d1d5db',
                                    borderRadius: '10px'
                                }}
                            />
                        </div>

                        <div className="alert border-0 mb-0" style={{
                            background: darkMode ? 'rgba(59, 130, 246, 0.15)' : '#dbeafe',
                            color: darkMode ? '#93c5fd' : '#1e40af'
                        }}>
                            <i className="bi bi-shield-check me-2"></i>
                            <strong>Human-in-the-Loop Safety:</strong> Your decision will be documented for compliance.
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="modal-footer p-3" style={{
                        background: darkMode ? '#0f172a' : '#f9fafb',
                        borderTop: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e5e7eb'
                    }}>
                        <button className="btn" onClick={onCancel} style={{
                            borderRadius: '8px',
                            background: darkMode ? 'rgba(255,255,255,0.08)' : '#e5e7eb',
                            color: darkMode ? 'rgba(255,255,255,0.7)' : '#4b5563',
                            border: 'none'
                        }}>
                            <i className="bi bi-x-circle me-2"></i>Cancel
                        </button>
                        <button className="btn btn-outline-danger" onClick={() => onReject(notes)} disabled={!notes.trim()} style={{
                            borderRadius: '8px',
                            borderWidth: '2px',
                            color: darkMode ? '#f87171' : undefined,
                            borderColor: darkMode ? '#f87171' : undefined
                        }}>
                            <i className="bi bi-hand-thumbs-down me-2"></i>Override (Not an Emergency)
                        </button>
                        <button className="btn btn-danger" onClick={() => onConfirm(notes)} disabled={!notes.trim()} style={{ borderRadius: '8px' }}>
                            <i className="bi bi-check-circle-fill me-2"></i>Confirm Emergency Protocol
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Assessment Summary Display - CHW-friendly format
function AssessmentSummaryDisplay({ data }) {
    if (!data) return null;

    let parsed = parseJsonSafely(data);

    // If it's still a string after parsing, try to extract the nested note
    if (typeof parsed === 'object' && parsed.note) {
        parsed = parseJsonSafely(parsed.note);
    }

    // If it's a string, display it formatted (handles both plain text and truncated JSON)
    if (typeof parsed === 'string') {
        // Try to clean up truncated JSON by showing it as readable text
        let displayText = parsed;

        // If it looks like truncated JSON, try to make it readable
        if (displayText.startsWith('{') && !displayText.endsWith('}')) {
            displayText = displayText
                .replace(/\{/g, '\n')
                .replace(/\}/g, '\n')
                .replace(/",\s*"/g, '\n\n')
                .replace(/["]/g, '')
                .replace(/:\s*/g, ': ')
                .replace(/\[/g, '\n  • ')
                .replace(/\]/g, '')
                .replace(/,\s*(?=\n|$)/g, '')
                .trim();
        }

        return (
            <div className="p-3 bg-light rounded" style={{ fontSize: '0.9rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {displayText}
            </div>
        );
    }

    // Helper to find a value by key with multiple variations
    const findValue = (obj, key) => {
        if (!obj || typeof obj !== 'object') return null;
        // Try exact key
        if (obj[key] !== undefined) return obj[key];
        // Try with spaces instead of underscores
        const withSpaces = key.replace(/_/g, ' ');
        if (obj[withSpaces] !== undefined) return obj[withSpaces];
        // Try with underscores instead of spaces
        const withUnderscores = key.replace(/ /g, '_');
        if (obj[withUnderscores] !== undefined) return obj[withUnderscores];
        // Try case-insensitive
        const lowerKey = key.toLowerCase().replace(/_/g, ' ');
        for (const k of Object.keys(obj)) {
            if (k.toLowerCase().replace(/_/g, ' ') === lowerKey) {
                return obj[k];
            }
        }
        return null;
    };

    const sections = [
        { key: 'SYMPTOM_ANALYSIS', label: 'Symptom Analysis', icon: 'bi-activity', color: '#6366f1' },
        { key: 'ADDITIONAL_QUESTIONS', label: 'Questions to Ask', icon: 'bi-question-circle', color: '#0ea5e9' },
        { key: 'EXAM_FINDINGS_TO_CHECK', label: 'Exam Findings to Check', icon: 'bi-search', color: '#8b5cf6' },
        { key: 'POSSIBLE_CONDITIONS', label: 'Possible Conditions', icon: 'bi-exclamation-triangle', color: '#f97316' },
        { key: 'RECOMMENDED_ACTIONS', label: 'Recommended Actions', icon: 'bi-check2-square', color: '#10b981' },
    ];

    // Check if we have any matching sections
    const hasAnySections = sections.some(({ key }) => findValue(parsed, key));

    // If no sections match, render all keys from the object
    if (!hasAnySections && typeof parsed === 'object') {
        return (
            <div className="row g-3">
                {Object.entries(parsed).map(([key, content], idx) => {
                    if (!content || key.startsWith('_')) return null;
                    const displayLabel = key.replace(/_/g, ' ');
                    const colors = ['#6366f1', '#0ea5e9', '#8b5cf6', '#f97316', '#10b981'];
                    const color = colors[idx % colors.length];

                    return (
                        <div key={key} className="col-12">
                            <div
                                className="rounded-3 p-3"
                                style={{
                                    background: `linear-gradient(135deg, ${color}08 0%, ${color}12 100%)`,
                                    borderLeft: `4px solid ${color}`
                                }}
                            >
                                <h6 className="fw-semibold mb-2 d-flex align-items-center gap-2" style={{ color }}>
                                    <i className="bi bi-clipboard-check"></i>
                                    {displayLabel}
                                </h6>
                                <div style={{ fontSize: '0.9rem', color: '#374151' }}>
                                    {Array.isArray(content) ? (
                                        <ul className="mb-0 ps-3">
                                            {content.map((item, i) => (
                                                <li key={i} className="mb-1">
                                                    {typeof item === 'object' ? JSON.stringify(item) : item}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : typeof content === 'object' ? (
                                        <pre className="mb-0" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'inherit' }}>
                                            {JSON.stringify(content, null, 2)}
                                        </pre>
                                    ) : (
                                        <p className="mb-0">{content}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    return (
        <div className="row g-3">
            {sections.map(({ key, label, icon, color }) => {
                const content = findValue(parsed, key);
                if (!content) return null;

                return (
                    <div key={key} className="col-12">
                        <div
                            className="rounded-3 p-3"
                            style={{
                                background: `linear-gradient(135deg, ${color}08 0%, ${color}12 100%)`,
                                borderLeft: `4px solid ${color}`
                            }}
                        >
                            <h6 className="fw-semibold mb-2 d-flex align-items-center gap-2" style={{ color }}>
                                <i className={`bi ${icon}`}></i>
                                {label}
                            </h6>
                            <div style={{ fontSize: '0.9rem', color: '#374151' }}>
                                {Array.isArray(content) ? (
                                    <ul className="mb-0 ps-3">
                                        {content.map((item, i) => (
                                            <li key={i} className="mb-1">{typeof item === 'object' ? JSON.stringify(item) : item}</li>
                                        ))}
                                    </ul>
                                ) : typeof content === 'object' ? (
                                    <pre className="mb-0" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 'inherit' }}>
                                        {JSON.stringify(content, null, 2)}
                                    </pre>
                                ) : (
                                    <p className="mb-0">{content}</p>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// SOAP Note Display - CHW-friendly format
function SOAPNoteDisplay({ data }) {
    if (!data) return null;

    let parsed = parseJsonSafely(data);

    // Extract nested note if present
    if (typeof parsed === 'object' && parsed.note) {
        parsed = parseJsonSafely(parsed.note);
    }

    // Handle SOAP_NOTE wrapper (backend sometimes wraps in this structure)
    if (typeof parsed === 'object' && parsed.SOAP_NOTE) {
        parsed = parsed.SOAP_NOTE;
    }

    if (typeof parsed === 'string') {
        // If it looks like truncated JSON, try to extract and format content
        let displayText = parsed;

        if (displayText.includes('{') || displayText.includes('"SOAP_NOTE"') || displayText.includes('"SUBJECTIVE"')) {
            // Convert JSON-like string into readable format
            displayText = displayText
                // Remove SOAP_NOTE wrapper
                .replace(/\{"SOAP_NOTE":\s*\{/g, '')
                // Format section headers
                .replace(/"(SUBJECTIVE|OBJECTIVE|ASSESSMENT|PLAN)":\s*\{/gi, '\n**$1**\n')
                .replace(/"(SUBJECTIVE|OBJECTIVE|ASSESSMENT|PLAN)":/gi, '\n**$1**:')
                // Format nested keys like Chief_Complaint
                .replace(/"([A-Za-z_]+)":\s*"/g, '\n• $1: ')
                .replace(/"([A-Za-z_]+)":\s*\{/g, '\n**$1**:\n')
                // Clean up JSON artifacts
                .replace(/"\s*(,|\})/g, '')
                .replace(/\{|\}/g, '')
                .replace(/\[|\]/g, '')
                .replace(/":\s*"/g, ': ')
                .replace(/",\s*"/g, '\n• ')
                .replace(/"/g, '')
                // Clean up underscores in keys
                .replace(/([A-Z][a-z]+)_([A-Za-z])/g, '$1 $2')
                // Clean up extra whitespace
                .replace(/\n{3,}/g, '\n\n')
                .trim();

            // If there's a truncation indicator, add ellipsis
            if (!displayText.endsWith('.') && !displayText.endsWith(':') && !displayText.endsWith('\n')) {
                displayText += '... [truncated]';
            }
        }

        return (
            <div className="p-3 bg-light rounded" style={{ fontSize: '0.9rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {displayText}
            </div>
        );
    }

    const soapSections = [
        { key: 'Subjective', icon: 'bi-chat-dots-fill', color: '#3b82f6', description: 'Patient reported symptoms' },
        { key: 'Objective', icon: 'bi-clipboard2-data-fill', color: '#8b5cf6', description: 'Physical exam findings' },
        { key: 'Assessment', icon: 'bi-search', color: '#f59e0b', description: 'Clinical assessment' },
        { key: 'Plan', icon: 'bi-list-check', color: '#10b981', description: 'Treatment plan' },
    ];

    // Helper to format nested keys for display (e.g., "Chief_Complaint" -> "Chief Complaint")
    const formatKey = (key) => {
        return key.replace(/_/g, ' ');
    };

    // Helper function to render content recursively - handles deeply nested structures
    const renderContent = (content, depth = 0) => {
        if (!content) return null;

        if (typeof content === 'string') {
            // Handle multiline strings
            if (content.includes('\n')) {
                return (
                    <div style={{ whiteSpace: 'pre-wrap' }}>
                        {content}
                    </div>
                );
            }
            return <span>{content}</span>;
        }

        if (Array.isArray(content)) {
            return (
                <ul className="mb-0 ps-3">
                    {content.map((item, i) => (
                        <li key={i} className="mb-1">
                            {typeof item === 'object' ? renderContent(item, depth + 1) : item}
                        </li>
                    ))}
                </ul>
            );
        }

        if (typeof content === 'object') {
            return (
                <div className={depth > 0 ? 'ps-2' : ''}>
                    {Object.entries(content).map(([subKey, subValue]) => {
                        // Skip internal fields
                        if (subKey.startsWith('_')) return null;

                        return (
                            <div key={subKey} className="mb-2">
                                <span className="fw-semibold" style={{ fontSize: '0.85rem', color: '#4b5563' }}>
                                    {formatKey(subKey)}:
                                </span>
                                <div className="ps-2">
                                    {renderContent(subValue, depth + 1)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            );
        }

        return <span>{String(content)}</span>;
    };

    // Check if we have any SOAP sections
    const hasSoapSections = soapSections.some(({ key }) =>
        parsed[key] || parsed[key.toLowerCase()] || parsed[key.toUpperCase()]
    );

    if (!hasSoapSections) {
        // Try to render the entire object as a formatted view
        return (
            <div className="p-3 bg-light rounded">
                {renderContent(parsed)}
            </div>
        );
    }

    return (
        <div className="row g-3">
            {soapSections.map(({ key, icon, color, description }) => {
                const content = parsed[key] || parsed[key.toLowerCase()] || parsed[key.toUpperCase()];
                if (!content) return null;

                return (
                    <div key={key} className="col-md-6">
                        <div
                            className="h-100 rounded-3 p-3"
                            style={{
                                background: `linear-gradient(135deg, ${color}08 0%, ${color}15 100%)`,
                                border: `1px solid ${color}25`
                            }}
                        >
                            <h6 className="fw-bold mb-1 d-flex align-items-center gap-2" style={{ color }}>
                                <i className={`bi ${icon}`}></i>
                                {key}
                            </h6>
                            <small className="text-muted d-block mb-2">{description}</small>
                            <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.6 }}>
                                {renderContent(content)}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}


function PatientDetails() {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const { darkMode } = useDarkMode();
    const [patient, setPatient] = useState(null);
    const [encounters, setEncounters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showNewEncounter, setShowNewEncounter] = useState(false);
    const [selectedEncounter, setSelectedEncounter] = useState(null);
    const [encounterVitals, setEncounterVitals] = useState([]);
    const [showEditPatient, setShowEditPatient] = useState(false);
    const [editPatientData, setEditPatientData] = useState({});
    const [saving, setSaving] = useState(false);
    // Workflow execution — all streaming/resume state lives in useWorkflowExecution (AIWorkflow.jsx)
    const {
        liveSteps,
        orchestratorThought,
        loading: rerunningAI,
        interruptedState,
        showConfirmation: showEmergencyConfirmation,
        workflowResult: aiResult,
        setWorkflowResult: setAiResult,
        executeWorkflow,
        resumeWorkflow,
        setShowConfirmation: setShowEmergencyConfirmation,
    } = useWorkflowExecution(null);

    useEffect(() => {
        const staffId = localStorage.getItem('staffId');
        if (!staffId) {
            navigate('/');
            return;
        }
        loadPatientData();
    }, [patientId, navigate]);

    const loadPatientData = async () => {
        try {
            setLoading(true);
            const [patientData, encountersData] = await Promise.all([
                apiService.getPatient(patientId),
                apiService.getPatientEncounters(patientId)
            ]);
            setPatient(patientData);
            // Handle array response
            const encountersList = Array.isArray(encountersData)
                ? encountersData
                : (encountersData.encounters || []);
            setEncounters(encountersList);
        } catch (err) {
            setError(err.message || 'Failed to load patient data');
        } finally {
            setLoading(false);
        }
    };

    const calculateAge = (dob) => {
        if (!dob) return 'N/A';
        const birthDate = new Date(dob);
        const diff = Date.now() - birthDate.getTime();
        return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getTriageBadge = (level) => {
        const colors = {
            'Urgent': 'bg-danger',
            'Moderate': 'bg-warning text-dark',
            'Routine': 'bg-success',
            'default': 'bg-secondary'
        };
        return colors[level] || colors.default;
    };

    const handleEncounterComplete = () => {
        setShowNewEncounter(false);
        loadPatientData();
    };

    const handleViewEncounter = async (encounter) => {
        setSelectedEncounter(encounter);
        // Load persisted AI assessment data if available
        if (encounter.ai_assessment_data) {
            setAiResult(encounter.ai_assessment_data);
        } else {
            setAiResult(null);
        }
        // Load vitals for this encounter
        try {
            const observations = await apiService.getObservationsByEncounter(encounter.id);
            const vitals = Array.isArray(observations) ? observations : (observations.observations || []);
            setEncounterVitals(vitals);
        } catch (err) {
            console.error('Failed to load vitals:', err);
            setEncounterVitals([]);
        }
    };

    const closeEncounterModal = () => {
        setSelectedEncounter(null);
        setEncounterVitals([]);
    };

    // Refresh patient + encounter data whenever workflow completes (including after resume)
    useEffect(() => {
        if (aiResult && selectedEncounter) {
            loadPatientData();
            apiService.getEncounter(selectedEncounter.id).then(enc => setSelectedEncounter(enc));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aiResult]);

    const openEditModal = () => {
        setEditPatientData({
            age: patient.age || '',
            medical_history: patient.medical_history || '',
            allergies: patient.allergies || '',
            height_cm: patient.height_cm || '',
            weight_kg: patient.weight_kg || '',
            mobile: patient.mobile || '',
            email: patient.email || ''
        });
        setShowEditPatient(true);
    };

    const savePatient = async () => {
        setSaving(true);
        try {
            await apiService.updatePatient(patientId, editPatientData);
            setShowEditPatient(false);
            loadPatientData(); // Reload patient data
        } catch (err) {
            alert('Failed to save: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light">
                <div className="text-center">
                    <div className="spinner-border text-primary" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                    <p className="mt-3 text-muted">Loading patient details...</p>
                </div>
            </div>
        );
    }

    if (error || !patient) {
        return (
            <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light">
                <div className="text-center">
                    <div className="text-danger mb-3" style={{ fontSize: '48px' }}>⚠️</div>
                    <h4>Error Loading Patient</h4>
                    <p className="text-muted">{error || 'Patient not found'}</p>
                    <Link to="/patients" className="btn btn-primary">
                        ← Back to Patients
                    </Link>
                </div>
            </div>
        );
    }

    const initials = patient.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);

    return (
        <div className="min-vh-100" style={{
            background: darkMode
                ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
                : 'linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%)'
        }}>
            {/* Emergency Confirmation Modal */}
            {showEmergencyConfirmation && interruptedState && (
                <EmergencyConfirmationDialog
                    context={interruptedState.confirmation_context}
                    onConfirm={(notes) => resumeWorkflow("approve", notes)}
                    onReject={(notes) => resumeWorkflow("reject", notes)}
                    onCancel={() => setShowEmergencyConfirmation(false)}
                />
            )}

            {/* Navigation */}
            <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
                <div className="container-fluid">
                    <Link to="/dashboard" className="navbar-brand d-flex align-items-center">
                        <i className="bi bi-hospital me-2"></i>
                        JeevanAlert AI
                    </Link>
                    <ul className="navbar-nav">
                        <li className="nav-item">
                            <Link to="/dashboard" className="nav-link">
                                <i className="bi bi-speedometer2 me-1"></i> Dashboard
                            </Link>
                        </li>
                        <li className="nav-item">
                            <Link to="/patients" className="nav-link">
                                <i className="bi bi-people-fill me-1"></i> Patients
                            </Link>
                        </li>
                    </ul>
                </div>
            </nav>

            <div className="container py-4">
                {/* Back Button */}
                <Link to="/patients" className="btn btn-outline-secondary mb-4">
                    <i className="bi bi-arrow-left me-2"></i>
                    Back to Patients
                </Link>

                {/* Patient Header Card */}
                <div className="card mb-4 shadow-sm">
                    <div className="card-body">
                        <div className="row align-items-center">
                            <div className="col-auto">
                                <div
                                    className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center"
                                    style={{ width: '80px', height: '80px', fontSize: '28px', fontWeight: 'bold' }}
                                >
                                    {initials}
                                </div>
                            </div>
                            <div className="col">
                                <h2 className="mb-1">{patient.name}</h2>
                                <div className="text-muted">
                                    <span className="me-3">
                                        <i className="bi bi-calendar-event me-1"></i>
                                        {patient.age || 'N/A'} years old
                                    </span>
                                    <span className="me-3">
                                        <i className="bi bi-gender-ambiguous me-1"></i>
                                        {patient.gender}
                                    </span>
                                    <span>
                                        <i className="bi bi-telephone me-1"></i>
                                        {patient.mobile || 'No phone'}
                                    </span>
                                </div>
                            </div>
                            <div className="col-auto d-flex gap-2">
                                <button
                                    className="btn btn-outline-primary btn-lg"
                                    onClick={openEditModal}
                                >
                                    <i className="bi bi-pencil-square me-2"></i>
                                    Edit Patient
                                </button>
                                <button
                                    className="btn btn-primary btn-lg"
                                    onClick={() => setShowNewEncounter(true)}
                                >
                                    <i className="bi bi-clipboard2-pulse me-2"></i>
                                    Start New Encounter
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Patient Info Cards */}
                <div className="row mb-4">
                    <div className="col-md-6">
                        <div className="card h-100 shadow-sm">
                            <div className="card-header bg-white">
                                <h5 className="mb-0">
                                    <i className="bi bi-person-vcard me-2 text-primary"></i>
                                    Contact Information
                                </h5>
                            </div>
                            <div className="card-body">
                                <p><strong>Email:</strong> {patient.email || 'Not provided'}</p>
                                <p><strong>Phone:</strong> {patient.mobile_country_code || ''} {patient.mobile}</p>
                                <p><strong>Address:</strong> {
                                    patient.address?.street || patient.address?.city
                                        ? `${patient.address.street || ''}, ${patient.address.city || ''} ${patient.address.country || ''}`
                                        : 'Not provided'
                                }</p>
                            </div>
                        </div>
                    </div>
                    <div className="col-md-6">
                        <div className="card h-100 shadow-sm">
                            <div className="card-header bg-white">
                                <h5 className="mb-0">
                                    <i className="bi bi-heart-pulse me-2 text-danger"></i>
                                    Medical Information
                                </h5>
                            </div>
                            <div className="card-body">
                                <p><strong>Medical History:</strong> {patient.medical_history || 'None recorded'}</p>
                                <p><strong>Allergies:</strong> {patient.allergies || 'None recorded'}</p>
                                <p><strong>Height:</strong> {patient.height_cm ? `${patient.height_cm} cm` : 'N/A'}</p>
                                <p><strong>Weight:</strong> {patient.weight_kg ? `${patient.weight_kg} kg` : 'N/A'}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Encounters History */}
                <div className="card shadow-sm">
                    <div className="card-header bg-white d-flex justify-content-between align-items-center">
                        <h5 className="mb-0">
                            <i className="bi bi-clock-history me-2 text-info"></i>
                            Encounter History
                        </h5>
                        <span className="badge bg-primary">{encounters.length} encounters</span>
                    </div>
                    <div className="card-body">
                        {encounters.length === 0 ? (
                            <div className="text-center py-5">
                                <div style={{ fontSize: '48px' }}>📋</div>
                                <p className="text-muted mt-2">No encounters recorded yet</p>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => setShowNewEncounter(true)}
                                >
                                    Start First Encounter
                                </button>
                            </div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-hover">
                                    <thead className="table-light">
                                        <tr>
                                            <th>Date</th>
                                            <th>Chief Complaint</th>
                                            <th>Symptoms</th>
                                            <th>Triage Level</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {encounters.map((encounter) => (
                                            <tr key={encounter.id}>
                                                <td>
                                                    <small>{formatDate(encounter.created_at)}</small>
                                                </td>
                                                <td>
                                                    <strong>{encounter.chief_complaint || 'N/A'}</strong>
                                                </td>
                                                <td>
                                                    <small className="text-muted">
                                                        {encounter.symptoms
                                                            ? (encounter.symptoms.length > 50
                                                                ? encounter.symptoms.substring(0, 50) + '...'
                                                                : encounter.symptoms)
                                                            : 'N/A'
                                                        }
                                                    </small>
                                                </td>
                                                <td>
                                                    {encounter.triage_level ? (
                                                        <span className={`badge ${getTriageBadge(encounter.triage_level)}`}>
                                                            {encounter.triage_level}
                                                        </span>
                                                    ) : (
                                                        <span className="badge bg-secondary">Not assessed</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className={`badge ${encounter.status === 'completed' ? 'bg-success' :
                                                        encounter.status === 'in-progress' ? 'bg-warning text-dark' :
                                                            'bg-info'
                                                        }`}>
                                                        {encounter.status || 'planned'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <button
                                                        className="btn btn-sm btn-outline-primary me-2"
                                                        onClick={() => handleViewEncounter(encounter)}
                                                        title="View Details"
                                                    >
                                                        <i className="bi bi-eye"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* New Encounter Modal */}
            {showNewEncounter && (
                <NewEncounter
                    patientId={patientId}
                    patientName={patient.name}
                    onComplete={handleEncounterComplete}
                    onCancel={() => setShowNewEncounter(false)}
                />
            )}

            {/* Encounter Details Modal */}
            {selectedEncounter && (
                <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">
                                    <i className="bi bi-clipboard2-pulse me-2"></i>
                                    Encounter Details
                                </h5>
                                <button
                                    type="button"
                                    className="btn-close"
                                    onClick={closeEncounterModal}
                                ></button>
                            </div>
                            <div className="modal-body">
                                <div className="row mb-3">
                                    <div className="col-md-6">
                                        <label className="form-label text-muted">Date</label>
                                        <p className="fw-bold">{formatDate(selectedEncounter.created_at)}</p>
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label text-muted">Status</label>
                                        <p>
                                            <span className={`badge ${selectedEncounter.status === 'completed' ? 'bg-success' :
                                                selectedEncounter.status === 'in-progress' ? 'bg-warning text-dark' :
                                                    'bg-info'
                                                }`}>
                                                {selectedEncounter.status || 'planned'}
                                            </span>
                                        </p>
                                    </div>
                                </div>

                                <div className="mb-3">
                                    <label className="form-label text-muted">Chief Complaint</label>
                                    <p className="fw-bold">{selectedEncounter.chief_complaint || 'N/A'}</p>
                                </div>

                                <div className="mb-3">
                                    <label className="form-label text-muted">Symptoms</label>
                                    <p>{selectedEncounter.symptoms || 'N/A'}</p>
                                </div>

                                <div className="mb-3">
                                    <label className="form-label text-muted">Duration</label>
                                    <p>{selectedEncounter.symptom_duration || 'N/A'}</p>
                                </div>

                                {/* Vital Signs Section */}
                                <div className="mb-4">
                                    <h6 className="text-primary border-bottom pb-2">
                                        <i className="bi bi-heart-pulse me-2"></i>
                                        Vital Signs
                                    </h6>
                                    {encounterVitals.length > 0 ? (
                                        <div className="row">
                                            {encounterVitals.map((vital, idx) => (
                                                <div className="col-md-4 mb-2" key={idx}>
                                                    <div className="bg-light rounded p-2 text-center">
                                                        <small className="text-muted d-block">{vital.observation_type}</small>
                                                        <strong>
                                                            {vital.value}
                                                            {vital.value_secondary && `/${vital.value_secondary}`}
                                                            {vital.unit && <small className="ms-1">{vital.unit}</small>}
                                                        </strong>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-muted fst-italic">No vitals recorded for this encounter</p>
                                    )}
                                </div>

                                {selectedEncounter.triage_level && (
                                    <div className="mb-3">
                                        <label className="form-label text-muted">Triage Level</label>
                                        <p>
                                            <span className={`badge ${getTriageBadge(selectedEncounter.triage_level)}`}>
                                                {selectedEncounter.triage_level}
                                            </span>
                                        </p>
                                    </div>
                                )}





                                {/* Live Workflow Tracker (shown during re-run) */}
                                {rerunningAI && liveSteps.length > 0 && (
                                    <div className="mt-4 pt-3 border-top">
                                        <WorkflowTracker
                                            steps={liveSteps}
                                            orchestratorThought={orchestratorThought}
                                            hasImage={false}
                                            loading={rerunningAI}
                                        />
                                    </div>
                                )}

                                {/* AI Rerun Results Section */}
                                {aiResult && (
                                    <div className="mt-4 pt-3 border-top">
                                        <h5 className="d-flex align-items-center gap-2 mb-4" style={{ color: '#0d9488' }}>
                                            <i className="bi bi-cpu-fill"></i>
                                            AI Assessment Results
                                        </h5>

                                        {aiResult.error ? (
                                            <div className="alert alert-danger d-flex align-items-center" role="alert">
                                                <i className="bi bi-exclamation-triangle-fill me-2"></i>
                                                {aiResult.error}
                                            </div>
                                        ) : (
                                            <div className="d-flex flex-column gap-4">

                                                {/* ── 1. Triage & Clinical Assessment ── */}
                                                <div className="card border-0 shadow-sm" style={{ borderRadius: '12px' }}>
                                                    <div className="card-header border-0 py-3" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', borderRadius: '12px 12px 0 0' }}>
                                                        <h6 className="mb-0 fw-semibold d-flex align-items-center gap-2" style={{ color: '#1e40af' }}>
                                                            <i className="bi bi-clipboard2-pulse"></i>
                                                            Clinical Assessment
                                                        </h6>
                                                    </div>
                                                    <div className="card-body">
                                                        <div className="row g-3">
                                                            {aiResult.triage_level && (
                                                                <div className="col-md-6">
                                                                    <div className="p-3 rounded-3" style={{ background: darkMode ? '#334155' : '#f8fafc' }}>
                                                                        <small className="text-muted d-block mb-1 fw-medium">Triage Level</small>
                                                                        <span className={`badge fs-6 ${getTriageBadge(aiResult.triage_level)}`}>
                                                                            {aiResult.triage_level}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {aiResult.risk_level && (
                                                                <div className="col-md-6">
                                                                    <div className="p-3 rounded-3" style={{ background: darkMode ? '#334155' : '#f8fafc' }}>
                                                                        <small className="text-muted d-block mb-1 fw-medium">Risk Level</small>
                                                                        <span className={`badge fs-6 ${aiResult.risk_level?.toLowerCase() === 'high' ? 'bg-danger' :
                                                                            aiResult.risk_level?.toLowerCase() === 'moderate' ? 'bg-warning text-dark' : 'bg-success'}`}>
                                                                            {aiResult.risk_level}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {aiResult.differential_diagnoses && aiResult.differential_diagnoses.length > 0 && (
                                                                <div className="col-12">
                                                                    <div className="p-3 rounded-3" style={{ background: darkMode ? '#334155' : '#f8fafc' }}>
                                                                        <small className="text-muted d-block mb-2 fw-medium">
                                                                            <i className="bi bi-list-check me-1"></i>Possible Diagnoses
                                                                        </small>
                                                                        <div className="d-flex flex-wrap gap-2">
                                                                            {aiResult.differential_diagnoses.map((dx, idx) => (
                                                                                <span key={idx} className="badge bg-primary bg-opacity-10 text-primary px-3 py-2" style={{ fontSize: '0.85rem' }}>
                                                                                    {dx}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* ── 2. Red Flags ── */}
                                                {aiResult.red_flags && aiResult.red_flags.length > 0 && (
                                                    <div className="card border-0 shadow-sm" style={{ borderRadius: '12px', borderLeft: '4px solid #ef4444' }}>
                                                        <div className="card-header border-0 py-3" style={{ background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', borderRadius: '12px 12px 0 0' }}>
                                                            <h6 className="mb-0 fw-semibold d-flex align-items-center gap-2 text-danger">
                                                                <i className="bi bi-exclamation-triangle-fill"></i>
                                                                ⚠️ Red Flags — Needs Immediate Attention
                                                            </h6>
                                                        </div>
                                                        <div className="card-body">
                                                            <ul className="mb-0 list-unstyled">
                                                                {aiResult.red_flags.map((flag, idx) => (
                                                                    <li key={idx} className="d-flex align-items-start gap-2 mb-2">
                                                                        <i className="bi bi-flag-fill text-danger mt-1" style={{ fontSize: '0.75rem' }}></i>
                                                                        <span style={{ color: '#991b1b' }}>{flag}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── 3. Recommended Investigations ── */}
                                                {aiResult.recommended_investigations && aiResult.recommended_investigations.length > 0 && (
                                                    <div className="card border-0 shadow-sm" style={{ borderRadius: '12px' }}>
                                                        <div className="card-header border-0 py-3" style={{ background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)', borderRadius: '12px 12px 0 0' }}>
                                                            <h6 className="mb-0 fw-semibold d-flex align-items-center gap-2" style={{ color: '#7c3aed' }}>
                                                                <i className="bi bi-search"></i>
                                                                Recommended Investigations
                                                            </h6>
                                                        </div>
                                                        <div className="card-body">
                                                            <div className="d-flex flex-wrap gap-2">
                                                                {aiResult.recommended_investigations.map((inv, idx) => (
                                                                    <span key={idx} className="badge bg-white border px-3 py-2" style={{ color: '#7c3aed', fontSize: '0.85rem' }}>
                                                                        <i className="bi bi-check-circle me-1"></i>{inv}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── 4. Skin Lesion Analysis (ISIC MedGemma) ── */}
                                                {aiResult.skin_cancer_result && (
                                                    <div className="card border-0 shadow-sm" style={{ borderRadius: '12px', borderLeft: '4px solid #8b5cf6' }}>
                                                        <div className="card-header border-0 py-3" style={{ background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)', borderRadius: '12px 12px 0 0' }}>
                                                            <h6 className="mb-0 fw-semibold d-flex align-items-center gap-2" style={{ color: '#7c3aed' }}>
                                                                <i className="bi bi-camera-fill"></i>
                                                                Skin Lesion Analysis (ISIC MedGemma)
                                                            </h6>
                                                        </div>
                                                        <div className="card-body">
                                                            <div className="row g-3">
                                                                {/* Classification */}
                                                                <div className="col-md-6">
                                                                    <div className="p-3 rounded-3" style={{ background: darkMode ? '#334155' : '#f8fafc' }}>
                                                                        <small className="text-muted d-block mb-2 fw-medium">
                                                                            <i className="bi bi-clipboard-check me-1"></i>Classification
                                                                        </small>
                                                                        <div className="d-flex align-items-center gap-2">
                                                                            <span className={`badge fs-6 ${aiResult.skin_cancer_result.classification === 'malignant'
                                                                                ? 'bg-danger'
                                                                                : 'bg-success'
                                                                                }`}>
                                                                                {aiResult.skin_cancer_result.classification?.toUpperCase()}
                                                                            </span>
                                                                            <span className="text-muted small">
                                                                                Confidence: {(aiResult.skin_cancer_result.confidence * 100).toFixed(0)}%
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Referral Status */}
                                                                <div className="col-md-6">
                                                                    <div className="p-3 rounded-3" style={{ background: darkMode ? '#334155' : '#f8fafc' }}>
                                                                        <small className="text-muted d-block mb-2 fw-medium">
                                                                            <i className="bi bi-hospital me-1"></i>Referral Status
                                                                        </small>
                                                                        <div className="d-flex align-items-center gap-2">
                                                                            {aiResult.skin_cancer_result.requires_referral ? (
                                                                                <>
                                                                                    <span className="badge bg-warning text-dark fs-6">
                                                                                        Referral Recommended
                                                                                    </span>
                                                                                    <span className="text-muted small">
                                                                                        {aiResult.skin_cancer_result.urgency === 'urgent' ? 'URGENT' : 'Routine'}
                                                                                    </span>
                                                                                </>
                                                                            ) : (
                                                                                <span className="badge bg-info text-white fs-6">
                                                                                    No Referral Needed
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Analysis Reasoning */}
                                                                {aiResult.skin_cancer_result.reasoning && (
                                                                    <div className="col-12">
                                                                        <div className="p-3 rounded-3" style={{ background: darkMode ? '#334155' : '#f8fafc' }}>
                                                                            <small className="text-muted d-block mb-2 fw-medium">
                                                                                <i className="bi bi-info-circle me-1"></i>AI Analysis
                                                                            </small>
                                                                            <p className="mb-0" style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
                                                                                {aiResult.skin_cancer_result.reasoning}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Urgent Referral Warning */}
                                                                {aiResult.skin_cancer_result.requires_referral &&
                                                                    aiResult.skin_cancer_result.urgency === 'urgent' && (
                                                                        <div className="col-12">
                                                                            <div className="alert alert-warning d-flex align-items-start mb-0" role="alert">
                                                                                <i className="bi bi-exclamation-triangle-fill me-2 mt-1"></i>
                                                                                <div className="small">
                                                                                    <strong>⚠️ Urgent Dermatology Referral Required</strong>
                                                                                    <br />
                                                                                    Suspicious lesion detected. Arrange dermatology consultation within 1-2 weeks for biopsy evaluation.
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── 5. Referral Decision ── */}
                                                {(aiResult.referral_needed !== undefined) && (
                                                    <div className="card border-0 shadow-sm" style={{ borderRadius: '12px' }}>
                                                        <div className="card-header border-0 py-3" style={{ background: aiResult.referral_needed ? 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)' : 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', borderRadius: '12px 12px 0 0' }}>
                                                            <h6 className="mb-0 fw-semibold d-flex align-items-center gap-2" style={{ color: aiResult.referral_needed ? '#c2410c' : '#16a34a' }}>
                                                                <i className={`bi ${aiResult.referral_needed ? 'bi-hospital' : 'bi-check-circle-fill'}`}></i>
                                                                Referral Decision
                                                            </h6>
                                                        </div>
                                                        <div className="card-body">
                                                            <div className="d-flex align-items-center gap-3">
                                                                <span className={`badge fs-6 ${aiResult.referral_needed ? 'bg-warning text-dark' : 'bg-success'}`}>
                                                                    {aiResult.referral_needed ? 'Referral Needed' : 'No Referral Needed'}
                                                                </span>
                                                                {aiResult.referral_type && aiResult.referral_type !== 'none' && (
                                                                    <span className="text-muted">
                                                                        <strong>Type:</strong> {aiResult.referral_type}
                                                                    </span>
                                                                )}
                                                                {aiResult.referral_urgency && (
                                                                    <span className="text-muted">
                                                                        <strong>Urgency:</strong> {aiResult.referral_urgency}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── 6. Treatment Plan ── */}
                                                {(aiResult.medications?.length > 0 || aiResult.care_plan_goals?.length > 0) && (
                                                    <div className="card border-0 shadow-sm" style={{ borderRadius: '12px' }}>
                                                        <div className="card-header border-0 py-3" style={{ background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', borderRadius: '12px 12px 0 0' }}>
                                                            <h6 className="mb-0 fw-semibold d-flex align-items-center gap-2" style={{ color: '#059669' }}>
                                                                <i className="bi bi-capsule"></i>
                                                                Treatment Plan
                                                            </h6>
                                                        </div>
                                                        <div className="card-body">
                                                            {/* Medications Table */}
                                                            {aiResult.medications && aiResult.medications.length > 0 && (
                                                                <div className="mb-3">
                                                                    <small className="text-muted fw-semibold d-block mb-2">
                                                                        <i className="bi bi-prescription2 me-1"></i>Medications
                                                                    </small>
                                                                    <div className="table-responsive">
                                                                        <table className="table table-sm table-hover mb-0" style={{ fontSize: '0.9rem' }}>
                                                                            <thead className="table-light">
                                                                                <tr>
                                                                                    <th>Medication</th>
                                                                                    <th>Dose</th>
                                                                                    <th>Frequency</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {aiResult.medications.map((med, idx) => (
                                                                                    <tr key={idx}>
                                                                                        <td className="fw-medium">{typeof med === 'string' ? med : med.name}</td>
                                                                                        <td>{typeof med === 'object' ? med.dose : '—'}</td>
                                                                                        <td>{typeof med === 'object' ? med.frequency : '—'}</td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Care Plan Goals */}
                                                            {aiResult.care_plan_goals && aiResult.care_plan_goals.length > 0 && (
                                                                <div>
                                                                    <small className="text-muted fw-semibold d-block mb-2">
                                                                        <i className="bi bi-card-checklist me-1"></i>Care Plan Goals
                                                                    </small>
                                                                    <ul className="mb-0 list-unstyled">
                                                                        {aiResult.care_plan_goals.map((goal, idx) => (
                                                                            <li key={idx} className="d-flex align-items-start gap-2 mb-2">
                                                                                <i className="bi bi-check2-circle text-success mt-1"></i>
                                                                                <span>{goal}</span>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── 6. SOAP Note ── */}
                                                {aiResult.soap_note && typeof aiResult.soap_note === 'object' && (
                                                    <div className="card border-0 shadow-sm" style={{ borderRadius: '12px' }}>
                                                        <div className="card-header border-0 py-3" style={{ background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', borderRadius: '12px 12px 0 0' }}>
                                                            <h6 className="mb-0 fw-semibold d-flex align-items-center gap-2" style={{ color: '#0369a1' }}>
                                                                <i className="bi bi-file-earmark-medical"></i>
                                                                SOAP Note
                                                            </h6>
                                                        </div>
                                                        <div className="card-body p-0">
                                                            {[
                                                                { key: 'subjective', label: 'Subjective', icon: 'bi-chat-left-text', color: '#6366f1', desc: 'What the patient reports' },
                                                                { key: 'objective', label: 'Objective', icon: 'bi-eye', color: '#0ea5e9', desc: 'What you observe/measure' },
                                                                { key: 'assessment', label: 'Assessment', icon: 'bi-clipboard-check', color: '#f97316', desc: 'Clinical impression' },
                                                                { key: 'plan', label: 'Plan', icon: 'bi-list-task', color: '#10b981', desc: 'Next steps & actions' },
                                                            ].map(({ key, label, icon, color, desc }) => {
                                                                const content = aiResult.soap_note[key] || aiResult.soap_note[key.toUpperCase()];
                                                                if (!content) return null;
                                                                return (
                                                                    <div key={key} className="px-4 py-3" style={{ borderLeft: `4px solid ${color}`, borderBottom: '1px solid #f1f5f9' }}>
                                                                        <div className="d-flex align-items-center gap-2 mb-1">
                                                                            <i className={`bi ${icon}`} style={{ color }}></i>
                                                                            <strong style={{ color }}>{label}</strong>
                                                                            <small className="text-muted">— {desc}</small>
                                                                        </div>
                                                                        <p className="mb-0" style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>{content}</p>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={closeEncounterModal}
                                >
                                    Close
                                </button>
                                {aiResult && !aiResult.error && (
                                    <button
                                        type="button"
                                        className="btn btn-outline-primary"
                                        onClick={() => {
                                            const result = generateEncounterPDF(selectedEncounter, aiResult, encounterVitals, patient.name);
                                            if (result && result.success) {
                                                console.log('PDF download started');
                                            }
                                        }}
                                    >
                                        <i className="bi bi-file-earmark-pdf me-2"></i>
                                        Download PDF
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="btn text-white"
                                    style={{
                                        background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
                                        border: 'none'
                                    }}
                                    onClick={() => executeWorkflow(selectedEncounter.id)}
                                    disabled={rerunningAI}
                                >
                                    {rerunningAI ? (
                                        <>
                                            <span className="spinner-border spinner-border-sm me-2"></span>
                                            Running AI...
                                        </>
                                    ) : (
                                        <>
                                            <i className="bi bi-arrow-repeat me-2"></i>
                                            Rerun AI Assessment
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Patient Modal */}
            {showEditPatient && (
                <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">
                                    <i className="bi bi-pencil-square me-2"></i>
                                    Edit Patient - {patient.name}
                                </h5>
                                <button
                                    type="button"
                                    className="btn-close"
                                    onClick={() => setShowEditPatient(false)}
                                ></button>
                            </div>
                            <div className="modal-body">
                                <h6 className="text-danger mb-3">
                                    <i className="bi bi-heart-pulse-fill me-2"></i>
                                    Medical Information
                                </h6>

                                <div className="mb-3">
                                    <label className="form-label">Allergies</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="e.g., Penicillin, Peanuts, None"
                                        value={editPatientData.allergies}
                                        onChange={(e) => setEditPatientData({ ...editPatientData, allergies: e.target.value })}
                                    />
                                </div>

                                <div className="mb-3">
                                    <label className="form-label">Medical History</label>
                                    <textarea
                                        className="form-control"
                                        rows="3"
                                        placeholder="e.g., Diabetes, Hypertension, Previous surgeries"
                                        value={editPatientData.medical_history}
                                        onChange={(e) => setEditPatientData({ ...editPatientData, medical_history: e.target.value })}
                                    />
                                </div>

                                <div className="row">
                                    <div className="col-md-4 mb-3">
                                        <label className="form-label">Age (years)</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            placeholder="e.g., 45"
                                            value={editPatientData.age}
                                            onChange={(e) => setEditPatientData({ ...editPatientData, age: e.target.value ? parseInt(e.target.value) : '' })}
                                            min="0"
                                            max="150"
                                        />
                                    </div>
                                    <div className="col-md-4 mb-3">
                                        <label className="form-label">Height (cm)</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            placeholder="e.g., 170"
                                            value={editPatientData.height_cm}
                                            onChange={(e) => setEditPatientData({ ...editPatientData, height_cm: e.target.value ? parseFloat(e.target.value) : '' })}
                                        />
                                    </div>
                                    <div className="col-md-4 mb-3">
                                        <label className="form-label">Weight (kg)</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            placeholder="e.g., 70"
                                            value={editPatientData.weight_kg}
                                            onChange={(e) => setEditPatientData({ ...editPatientData, weight_kg: e.target.value ? parseFloat(e.target.value) : '' })}
                                        />
                                    </div>
                                </div>

                                <hr className="my-3" />

                                <h6 className="text-primary mb-3">
                                    <i className="bi bi-person-vcard me-2"></i>
                                    Contact Information
                                </h6>

                                <div className="mb-3">
                                    <label className="form-label">Mobile</label>
                                    <input
                                        type="tel"
                                        className="form-control"
                                        value={editPatientData.mobile}
                                        onChange={(e) => setEditPatientData({ ...editPatientData, mobile: e.target.value })}
                                    />
                                </div>

                                <div className="mb-3">
                                    <label className="form-label">Email</label>
                                    <input
                                        type="email"
                                        className="form-control"
                                        value={editPatientData.email}
                                        onChange={(e) => setEditPatientData({ ...editPatientData, email: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowEditPatient(false)}
                                    disabled={saving}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={savePatient}
                                    disabled={saving}
                                >
                                    {saving ? (
                                        <>
                                            <span className="spinner-border spinner-border-sm me-2"></span>
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <i className="bi bi-check-lg me-2"></i>
                                            Save Changes
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default PatientDetails;
