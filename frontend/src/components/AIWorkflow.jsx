import React, { useState, useCallback } from 'react';
import apiService from '../services/apiService';
import { useDarkMode } from '../context/DarkModeContext';

/**
 * AI-Powered Clinical Workflow Component
 * Executes MedGemma tool-based orchestrator workflow and displays results
 */

// Helper: parse a value that might be a JSON string into readable text
function parseAgentOutput(value) {
    if (!value) return null;
    if (typeof value !== 'string') return value;

    // Try to parse JSON strings
    try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object') return parsed;
        return parsed;
    } catch {
        // Not JSON, return as-is
        return value;
    }
}

// Helper: render text with section headers (HEADER: content) as structured blocks
function FormattedText({ text }) {
    if (!text) return null;
    const str = typeof text === 'string' ? text : JSON.stringify(text, null, 2);

    // Split by common agent output headers
    const headerPattern = /^((?:VITAL SIGNS SUMMARY|ABNORMALITIES|CLINICAL SIGNIFICANCE|PATTERN IDENTIFIED|RECOMMENDATIONS|TRENDING|SYMPTOM ANALYSIS|ADDITIONAL QUESTIONS|EXAM FINDINGS TO CHECK|POSSIBLE CONDITIONS|RECOMMENDED ACTIONS|SUBJECTIVE|OBJECTIVE|ASSESSMENT|PLAN|TRIAGE LEVEL|REASONING|RED FLAGS|NEXT STEPS|RISK LEVEL|RISK FACTORS|CHRONIC CONDITIONS?|GOALS?|INTERVENTIONS?|FOLLOW.?UP|WARNING SIGNS|MEDICATION|EDUCATION)[:\s]*)/im;

    const sections = str.split(headerPattern).filter(s => s.trim());

    if (sections.length <= 1) {
        // No headers found, render as paragraphs
        return (
            <div>
                {str.split('\n').filter(l => l.trim()).map((line, i) => {
                    const cleaned = line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '').trim();
                    if (!cleaned) return null;
                    if (line.trim().startsWith('-') || line.trim().startsWith('•') || line.trim().startsWith('*') || /^\d+\./.test(line.trim())) {
                        return <li key={i} className="mb-1" style={{ fontSize: '0.9rem', color: '#374151' }}>{cleaned}</li>;
                    }
                    return <p key={i} className="mb-1" style={{ fontSize: '0.9rem', color: '#374151' }}>{cleaned}</p>;
                })}
            </div>
        );
    }

    // Pair headers with their content
    const result = [];
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i].trim();
        if (headerPattern.test(section + ':')) {
            const header = section.replace(/:$/, '').trim();
            const content = sections[i + 1]?.trim() || '';
            i++; // skip content in next iteration
            result.push(
                <div key={i} className="mb-3">
                    <h6 className="fw-semibold text-primary mb-1" style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {header}
                    </h6>
                    <div className="ps-2" style={{ borderLeft: '3px solid #e2e8f0' }}>
                        {content.split('\n').filter(l => l.trim()).map((line, j) => {
                            const cleaned = line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '').trim();
                            if (!cleaned) return null;
                            return <p key={j} className="mb-1 text-secondary" style={{ fontSize: '0.9rem' }}>{cleaned}</p>;
                        })}
                    </div>
                </div>
            );
        } else {
            result.push(
                <p key={`p-${i}`} className="mb-1 text-secondary" style={{ fontSize: '0.9rem' }}>{section}</p>
            );
        }
    }
    return <div>{result}</div>;
}

// Helper: render SOAP note from the nested object
function SOAPNote({ data }) {
    if (!data) return null;

    let noteData = data;

    // If it's a string, try to parse it
    if (typeof noteData === 'string') {
        noteData = parseAgentOutput(noteData);
    }

    // Extract the nested note if present
    if (typeof noteData === 'object' && noteData.note) {
        noteData = parseAgentOutput(noteData.note);
    }

    // Handle SOAP_NOTE wrapper (backend sometimes wraps in this structure)
    if (typeof noteData === 'object' && noteData.SOAP_NOTE) {
        noteData = noteData.SOAP_NOTE;
    }

    // If still a string (plain text SOAP note), format with section headers
    if (typeof noteData === 'string') {
        return <FormattedText text={noteData} />;
    }

    // Helper to format nested keys for display (e.g., "Chief_Complaint" -> "Chief Complaint")
    const formatKey = (key) => key.replace(/_/g, ' ');

    // Helper to render nested content
    const renderContent = (content, depth = 0) => {
        if (!content) return null;

        if (typeof content === 'string') {
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

    // Structured SOAP with keys like Subjective, Objective, etc.
    const soapSections = [
        { key: 'Subjective', icon: 'bi-chat-dots-fill', color: '#3b82f6' },
        { key: 'Objective', icon: 'bi-clipboard2-data-fill', color: '#8b5cf6' },
        { key: 'Assessment', icon: 'bi-search', color: '#f59e0b' },
        { key: 'Plan', icon: 'bi-list-check', color: '#10b981' },
    ];

    // Check if we have any SOAP sections
    const hasSoapSections = soapSections.some(({ key }) =>
        noteData[key] || noteData[key.toLowerCase()] || noteData[key.toUpperCase()]
    );

    if (!hasSoapSections) {
        // Render the entire object as formatted content
        return (
            <div className="p-3 bg-light rounded">
                {renderContent(noteData)}
            </div>
        );
    }

    return (
        <div className="row g-3">
            {soapSections.map(({ key, icon, color }) => {
                const content = noteData[key] || noteData[key.toLowerCase()] || noteData[key.toUpperCase()];
                if (!content) return null;
                return (
                    <div key={key} className="col-md-6">
                        <div className="p-3 rounded-3 h-100" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
                            <h6 className="fw-bold mb-2" style={{ color }}>
                                <i className={`bi ${icon} me-2`}></i>
                                {key}
                            </h6>
                            <div style={{ fontSize: '0.9rem', lineHeight: '1.6', color: '#374151' }}>
                                {renderContent(content)}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// Agent card wrapper
function AgentCard({ icon, title, gradient, children, badge }) {
    return (
        <div className="card border-0 shadow-sm h-100" style={{ borderRadius: '16px', overflow: 'hidden' }}>
            <div className="card-header border-0 text-white py-3" style={{ background: gradient }}>
                <div className="d-flex align-items-center justify-content-between">
                    <div className="d-flex align-items-center gap-2">
                        <i className={`bi ${icon} fs-4`}></i>
                        <h5 className="mb-0 fw-bold">{title}</h5>
                    </div>
                    {badge && <span className="badge bg-white bg-opacity-25 px-2 py-1" style={{ fontSize: '0.75rem' }}>{badge}</span>}
                </div>
            </div>
            <div className="card-body">{children}</div>
        </div>
    );
}

// Emergency Confirmation Dialog Component
function EmergencyConfirmationDialog({ context, onConfirm, onReject, onCancel }) {
    const [notes, setNotes] = useState('');
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
                                    <strong>AI Assessment:</strong> This case requires emergency intervention based on clinical assessment.
                                    Please review and confirm your clinical judgment.
                                </div>
                            </div>
                        </div>

                        {/* Clinical Context */}
                        <div className="row g-3 mb-4">
                            {/* Triage Level */}
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

                            {/* Differential Diagnoses */}
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

                        {/* Red Flags */}
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

                        {/* Assessment Summary */}
                        {context?.assessment_summary && (
                            <div className="mb-4">
                                <label className="fw-semibold mb-2 d-block" style={{
                                    color: darkMode ? '#e2e8f0' : '#1a1f36'
                                }}>
                                    <i className="bi bi-clipboard-check me-2"></i>
                                    Clinical Assessment
                                </label>
                                <div className="p-3 rounded-3 small" style={{
                                    background: darkMode ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
                                    color: darkMode ? '#cbd5e1' : '#374151'
                                }}>
                                    {context.assessment_summary}
                                </div>
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
                                placeholder="Document your clinical assessment and reasoning for this decision..."
                                style={{
                                    fontSize: '0.95rem',
                                    background: darkMode ? '#0f172a' : '#ffffff',
                                    color: darkMode ? '#f1f5f9' : '#1a1f36',
                                    border: darkMode ? '1px solid rgba(255,255,255,0.15)' : '1px solid #d1d5db',
                                    borderRadius: '10px'
                                }}
                            />
                            <div className="form-text" style={{
                                color: darkMode ? 'rgba(255,255,255,0.5)' : undefined
                            }}>
                                <i className="bi bi-info-circle me-1"></i>
                                Your clinical judgment and documentation will be recorded in the encounter record.
                            </div>
                        </div>

                        <div className="alert border-0 mb-0" style={{
                            background: darkMode ? 'rgba(59, 130, 246, 0.15)' : '#dbeafe',
                            color: darkMode ? '#93c5fd' : '#1e40af'
                        }}>
                            <i className="bi bi-shield-check me-2"></i>
                            <strong>Human-in-the-Loop Safety:</strong> Your decision will be documented for quality assurance and regulatory compliance.
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

// ─── CHW-friendly metadata for each tool ──────────────────────────────────
const TOOL_META = {
    clinical_assessment: { icon: 'bi-stethoscope', color: '#ef4444', bg: '#fef2f2' },
    emergency_protocol: { icon: 'bi-exclamation-triangle-fill', color: '#dc2626', bg: '#fee2e2' },
    skin_cancer_detection: { icon: 'bi-camera2', color: '#8b5cf6', bg: '#f5f3ff' },
    parallel_risk_referral: { icon: 'bi-diagram-2-fill', color: '#f97316', bg: '#fff7ed' },
    risk_assessment: { icon: 'bi-graph-up-arrow', color: '#f97316', bg: '#fff7ed' },
    referral_decision: { icon: 'bi-send-fill', color: '#e11d48', bg: '#fff1f2' },
    treatment_plan: { icon: 'bi-capsule', color: '#14b8a6', bg: '#f0fdfa' },
    soap_note_generation: { icon: 'bi-file-earmark-medical-fill', color: '#0ea5e9', bg: '#f0f9ff' },
};

// ─── Expected steps pre-populated immediately on workflow_start ────────────
// Shown in 'waiting' state so CHW sees the full plan upfront
export const EXPECTED_STEPS_BASE = [
    { tool: 'clinical_assessment', label: 'Checking Symptoms & Vitals', description: 'AI reviewing symptoms, vitals, and identifying red flags' },
    { tool: 'risk_assessment', label: 'Assessing Health Risk', description: 'Evaluating chronic conditions & patient risk factors' },
    { tool: 'referral_decision', label: 'Referral Check', description: 'Determining if specialist referral is needed' },
    { tool: 'treatment_plan', label: 'Building Treatment Plan', description: 'Recommending medications & care interventions' },
    { tool: 'soap_note_generation', label: 'Writing Clinical Notes (SOAP)', description: 'Documenting the encounter for your records' },
];
export const EXPECTED_STEPS_SKIN = [
    { tool: 'clinical_assessment', label: 'Checking Symptoms & Vitals', description: 'AI reviewing symptoms, vitals, and identifying red flags' },
    { tool: 'skin_cancer_detection', label: 'Scanning Skin Image with AI', description: 'ISIC-trained MedGemma analyzing dermoscopic image' },
    { tool: 'risk_assessment', label: 'Assessing Health Risk', description: 'Evaluating risk factors including skin findings' },
    { tool: 'referral_decision', label: 'Referral Check', description: 'Determining if specialist referral is needed' },
    { tool: 'treatment_plan', label: 'Building Treatment Plan', description: 'Recommending medications & care interventions' },
    { tool: 'soap_note_generation', label: 'Writing Clinical Notes (SOAP)', description: 'Documenting the encounter for your records' },
];

// ─── Live Workflow Tracker shown while analysis is running ─────────────────
export function WorkflowTracker({ steps, orchestratorThought, hasImage, loading }) {
    const doneCount = steps.filter(s => s.status === 'done').length;
    const totalExpected = steps.length || (hasImage ? 6 : 5);
    const pct = loading
        ? Math.min(92, Math.round((doneCount / totalExpected) * 100))
        : 100;

    return (
        <div>
            {/* Progress bar header */}
            <div className="mb-4 p-4 rounded-3 text-white"
                style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%)' }}>
                <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="fw-semibold fs-6">
                        {loading ? (
                            <>
                                <span className="spinner-grow spinner-grow-sm me-2" style={{ color: '#38bdf8' }}></span>
                                AI Analysis in Progress…
                            </>
                        ) : (
                            <>
                                <i className="bi bi-check-circle-fill me-2" style={{ color: '#4ade80' }}></i>
                                Analysis Complete
                            </>
                        )}
                    </span>
                    <span className="small" style={{ color: '#94a3b8' }}>
                        {doneCount} / {totalExpected} steps done
                    </span>
                </div>
                <div className="progress" style={{ height: '8px', background: 'rgba(255,255,255,0.15)', borderRadius: '99px' }}>
                    <div className="progress-bar" role="progressbar"
                        style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #38bdf8, #818cf8)', borderRadius: '99px', transition: 'width 0.6s ease' }}
                    />
                </div>

                {/* AI thought bubble */}
                {orchestratorThought && (
                    <div className="mt-3 px-3 py-2 rounded-2 small"
                        style={{ background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', fontStyle: 'italic', borderLeft: '3px solid #38bdf8' }}>
                        <i className="bi bi-cpu-fill me-2" style={{ color: '#38bdf8' }}></i>
                        <strong style={{ color: '#e2e8f0', fontStyle: 'normal' }}>AI Orchestrator: </strong>
                        {orchestratorThought}
                    </div>
                )}
            </div>

            {/* Step list */}
            <div className="d-flex flex-column gap-3">
                {/* Connecting placeholder — shown briefly before workflow_start arrives */}
                {loading && steps.length === 0 && (
                    <div className="d-flex align-items-center gap-3 p-3 rounded-3"
                        style={{ background: '#f8fafc', border: '1.5px dashed #e2e8f0' }}>
                        <div className="spinner-border spinner-border-sm" style={{ color: '#94a3b8', width: 20, height: 20, borderWidth: 2 }} />
                        <span className="small" style={{ color: '#94a3b8' }}>Connecting to AI… preparing workflow steps</span>
                    </div>
                )}

                {steps.map((step, idx) => {
                    const meta = TOOL_META[step.tool] || { icon: 'bi-gear-fill', color: '#6b7280', bg: '#f9fafb' };
                    const isWaiting = step.status === 'waiting';
                    const isRunning = step.status === 'running';
                    const isDone = step.status === 'done';
                    const hasError = step.status === 'error';

                    return (
                        <div key={idx}
                            className="d-flex align-items-start gap-3 p-3 rounded-3"
                            style={{
                                background: isRunning ? meta.bg : isDone ? '#f0fdf4' : '#fafafa',
                                border: `1.5px solid ${isRunning ? meta.color + '40' : isDone ? '#bbf7d0' : '#e5e7eb'}`,
                                opacity: isWaiting ? 0.55 : 1,
                                transition: 'all 0.3s ease',
                            }}
                        >
                            {/* Status icon */}
                            <div className="d-flex align-items-center justify-content-center flex-shrink-0"
                                style={{
                                    width: 42, height: 42, borderRadius: '50%',
                                    background: isDone ? '#16a34a' : hasError ? '#dc2626' : isWaiting ? '#d1d5db' : meta.color,
                                    boxShadow: isRunning ? `0 0 0 4px ${meta.color}30` : 'none',
                                    transition: 'all 0.3s ease',
                                }}>
                                {isRunning
                                    ? <span className="spinner-border spinner-border-sm text-white" style={{ width: 18, height: 18, borderWidth: 2 }} />
                                    : <i className={`bi ${isDone ? 'bi-check-lg' : hasError ? 'bi-x-lg' : meta.icon} text-white`} style={{ fontSize: '1rem' }} />
                                }
                            </div>

                            {/* Step info */}
                            <div className="flex-grow-1 min-w-0">
                                <div className="d-flex align-items-center gap-2">
                                    <span className="fw-semibold"
                                        style={{ color: isRunning ? meta.color : isDone ? '#16a34a' : '#9ca3af', fontSize: '0.95rem' }}>
                                        {step.label}
                                    </span>
                                    {isWaiting && (
                                        <span className="badge" style={{ background: '#f3f4f6', color: '#9ca3af', fontSize: '0.7rem' }}>
                                            Queued
                                        </span>
                                    )}
                                    {isRunning && (
                                        <span className="badge" style={{ background: meta.color + '20', color: meta.color, fontSize: '0.7rem' }}>
                                            Running…
                                        </span>
                                    )}
                                    {isDone && (
                                        <span className="badge" style={{ background: '#dcfce7', color: '#16a34a', fontSize: '0.7rem' }}>
                                            Done ✓
                                        </span>
                                    )}
                                </div>

                                <div className="small mt-1" style={{ color: '#6b7280' }}>
                                    {isRunning ? step.description : step.resultSummary || step.description}
                                </div>

                                {/* Quick result chips */}
                                {isDone && step.result && (
                                    <div className="d-flex flex-wrap gap-2 mt-2">
                                        {step.result.triage_level && (
                                            <span className="badge px-2 py-1" style={{ fontSize: '0.75rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                                                Triage: {step.result.triage_level}
                                            </span>
                                        )}
                                        {step.result.red_flags?.length > 0 && (
                                            <span className="badge px-2 py-1" style={{ fontSize: '0.75rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                                                {step.result.red_flags.length} Red Flag{step.result.red_flags.length > 1 ? 's' : ''}
                                            </span>
                                        )}
                                        {step.result.diagnoses?.length > 0 && (
                                            <span className="badge px-2 py-1" style={{ fontSize: '0.75rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                                                {step.result.diagnoses[0]}
                                            </span>
                                        )}
                                        {step.result.risk_level && (
                                            <span className="badge px-2 py-1" style={{ fontSize: '0.75rem', background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
                                                Risk: {step.result.risk_level}
                                            </span>
                                        )}
                                        {step.result.classification && (
                                            <span className="badge px-2 py-1" style={{ fontSize: '0.75rem', background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' }}>
                                                Skin: {step.result.classification} ({Math.round((step.result.confidence || 0) * 100)}%)
                                            </span>
                                        )}
                                        {step.result.referral_needed === true && (
                                            <span className="badge px-2 py-1" style={{ fontSize: '0.75rem', background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3' }}>
                                                Referral: {step.result.referral_type || 'Needed'} · {step.result.referral_urgency || ''}
                                            </span>
                                        )}
                                        {step.result.referral_needed === false && (
                                            <span className="badge px-2 py-1" style={{ fontSize: '0.75rem', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                                                No Referral Needed
                                            </span>
                                        )}
                                        {step.result.medications_count > 0 && (
                                            <span className="badge px-2 py-1" style={{ fontSize: '0.75rem', background: '#f0fdfa', color: '#0f766e', border: '1px solid #99f6e4' }}>
                                                {step.result.medications_count} Medication{step.result.medications_count > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Step number */}
                            <span className="flex-shrink-0 fw-bold" style={{ color: '#d1d5db', fontSize: '0.8rem', minWidth: 24, textAlign: 'right' }}>
                                #{idx + 1}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Shared workflow execution hook ────────────────────────────────────────
// Encapsulates all SSE streaming state and event handling so PatientDetails
// and the AIWorkflow tab can both use the same logic without duplication.
export function useWorkflowExecution(encounterId, { onComplete } = {}) {
    const [liveSteps, setLiveSteps] = useState([]);
    const [orchestratorThought, setOrchestratorThought] = useState('');
    const [hasImage, setHasImage] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [interruptedState, setInterruptedState] = useState(null);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [workflowResult, setWorkflowResult] = useState(null);

    // Single event handler shared by both the initial stream and the resume stream.
    // opts.encounterId overrides the hook's encounterId for PatientDetails (where the
    // encounterId comes from selectedEncounter at call-time, not from a hook param).
    const handleEvent = useCallback((event, opts = {}) => {
        const eid = opts.encounterId || encounterId;

        if (event.type === 'workflow_start') {
            setHasImage(!!event.has_image);
            const template = event.has_image ? EXPECTED_STEPS_SKIN : EXPECTED_STEPS_BASE;
            setLiveSteps(template.map(s => ({ ...s, status: 'waiting', result: null, resultSummary: null })));

        } else if (event.type === 'workflow_resume') {
            // Resume has started — mark emergency_protocol as running
            setLiveSteps(prev => prev.map(s =>
                s.tool === 'emergency_protocol' && s.status === 'waiting'
                    ? { ...s, status: 'running' }
                    : s
            ));

        } else if (event.type === 'orchestrator') {
            setOrchestratorThought(event.reasoning || '');

        } else if (event.type === 'step_start') {
            // parallel_risk_referral is a wrapper — mark both sub-steps running simultaneously
            if (event.tool === 'parallel_risk_referral') {
                setLiveSteps(prev => prev.map(s =>
                    (s.tool === 'risk_assessment' || s.tool === 'referral_decision') && s.status === 'waiting'
                        ? { ...s, status: 'running' }
                        : s
                ));
                return;
            }
            setLiveSteps(prev => {
                const waitingIdx = prev.findIndex(s => s.tool === event.tool && s.status === 'waiting');
                if (waitingIdx !== -1) {
                    return prev.map((s, i) => i === waitingIdx
                        ? { ...s, status: 'running', label: event.label || s.label, description: event.description || s.description }
                        : s
                    );
                }
                if (prev.some(s => s.tool === event.tool && s.status === 'running')) return prev;
                // Unexpected step (e.g. emergency_protocol if not injected yet) — append
                return [...prev, { tool: event.tool, label: event.label, description: event.description, status: 'running', result: null, resultSummary: null }];
            });

        } else if (event.type === 'step_complete') {
            if (event.tool === 'parallel_risk_referral') return;
            setLiveSteps(prev => prev.map(s =>
                s.tool === event.tool && s.status === 'running'
                    ? { ...s, status: 'done', result: event }
                    : s
            ));
            setOrchestratorThought('');

        } else if (event.type === 'interrupt') {
            // Inject emergency_protocol into the tracker right after clinical_assessment
            setLiveSteps(prev => {
                if (prev.some(s => s.tool === 'emergency_protocol')) return prev;
                const clinicalIdx = prev.findIndex(s => s.tool === 'clinical_assessment');
                const insertAt = clinicalIdx !== -1 ? clinicalIdx + 1 : prev.length;
                const next = [...prev];
                next.splice(insertAt, 0, {
                    tool: 'emergency_protocol',
                    label: 'Emergency Protocol',
                    description: 'Awaiting CHW confirmation to activate emergency response',
                    status: 'waiting',
                    result: null,
                    resultSummary: null,
                });
                return next;
            });
            setInterruptedState({
                encounter_id: eid,
                thread_id: event.data.thread_id,
                confirmation_context: event.data,
            });
            setShowConfirmation(true);
            setLoading(false);

        } else if (event.type === 'complete') {
            setWorkflowResult(event.data);
            setOrchestratorThought('Analysis complete');
            setLoading(false);
            setInterruptedState(null);
            onComplete?.(event.data);

        } else if (event.type === 'error') {
            setError(event.message);
            setLoading(false);
        }
    }, [encounterId, onComplete]);

    const executeWorkflow = useCallback(async (eid) => {
        // eid may be a MouseEvent when used as onClick={executeWorkflow} — ignore non-strings
        const id = (typeof eid === 'string' && eid) ? eid : encounterId;
        if (!id) { setError('No active encounter'); return; }
        setLoading(true);
        setError(null);
        setLiveSteps([]);
        setOrchestratorThought('');
        setWorkflowResult(null);
        setInterruptedState(null);
        setShowConfirmation(false);
        try {
            await apiService.streamWorkflow(id, (event) => handleEvent(event, { encounterId: id }));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [encounterId, handleEvent]);

    const resumeWorkflow = useCallback(async (decision, notes) => {
        if (!interruptedState) return;
        setLoading(true);
        setShowConfirmation(false);
        try {
            await apiService.streamResumeWorkflow(
                interruptedState.encounter_id,
                interruptedState.thread_id,
                decision,
                notes,
                (event) => handleEvent(event, { encounterId: interruptedState.encounter_id })
            );
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [interruptedState, handleEvent]);

    return {
        liveSteps, orchestratorThought, hasImage,
        loading, error, interruptedState, showConfirmation,
        workflowResult, setWorkflowResult,
        executeWorkflow, resumeWorkflow,
        setShowConfirmation,
    };
}

export default function AIWorkflow({ encounterId }) {
    const {
        liveSteps, orchestratorThought, hasImage,
        loading, error, interruptedState, showConfirmation,
        workflowResult: workflowState,
        executeWorkflow, resumeWorkflow,
        setShowConfirmation,
    } = useWorkflowExecution(encounterId);

    const getTriageColor = (level) => {
        switch (level?.toLowerCase()) {
            case 'emergent': case 'emergency': return { bg: '#dc2626', text: 'white' };
            case 'urgent': return { bg: '#f97316', text: 'white' };
            case 'semi-urgent': return { bg: '#eab308', text: 'black' };
            case 'routine': return { bg: '#22c55e', text: 'white' };
            default: return { bg: '#6b7280', text: 'white' };
        }
    };

    const getRiskColor = (level) => {
        switch (level?.toLowerCase()) {
            case 'high': case 'high-risk': return { bg: '#dc2626', icon: 'bi-exclamation-triangle-fill' };
            case 'moderate': case 'medium': return { bg: '#f97316', icon: 'bi-exclamation-circle-fill' };
            case 'low': case 'low-risk': return { bg: '#22c55e', icon: 'bi-check-circle-fill' };
            default: return { bg: '#6b7280', icon: 'bi-question-circle-fill' };
        }
    };

    const ws = workflowState;

    return (
        <div className="container-fluid py-4" style={{ background: '#f8fafc', minHeight: '100vh' }}>
            <div className="container">
                {/* Emergency Confirmation Modal */}
                {showConfirmation && interruptedState && (
                    <EmergencyConfirmationDialog
                        context={interruptedState.confirmation_context}
                        onConfirm={(notes) => resumeWorkflow("approve", notes)}
                        onReject={(notes) => resumeWorkflow("reject", notes)}
                        onCancel={() => setShowConfirmation(false)}
                    />
                )}

                {/* Header */}
                <div className="text-center mb-4">
                    <h3 className="fw-bold mb-1">AI Clinical Decision Support</h3>
                    <p className="text-muted mb-0" style={{ fontSize: '0.9rem' }}>
                        MedGemma-Powered Tool-Based Orchestrator · 7 Specialized Tools
                    </p>
                </div>

                {/* ── LAUNCH BUTTON (idle, no results yet) ── */}
                {!loading && !ws && liveSteps.length === 0 && (
                    <div className="text-center mb-5">
                        <div className="card border-0 shadow-sm mx-auto p-4" style={{ maxWidth: 480, borderRadius: 20 }}>
                            <div className="d-flex align-items-center justify-content-center mb-3"
                                style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #059669)', margin: '0 auto' }}>
                                <i className="bi bi-cpu-fill text-white" style={{ fontSize: '2rem' }}></i>
                            </div>
                            <h5 className="fw-bold mb-1">Ready for AI Analysis</h5>
                            <p className="text-muted small mb-4">
                                The AI will analyze patient data, vitals, and symptoms to provide triage, diagnoses, risk assessment, treatment plan, and clinical notes.
                            </p>

                            {/* What to expect list */}
                            <div className="d-flex flex-column gap-2 mb-4 text-start">
                                {[
                                    { icon: 'bi-stethoscope', color: '#ef4444', text: 'Triage Assessment' },
                                    { icon: 'bi-diagram-3-fill', color: '#8b5cf6', text: 'Differential Diagnoses' },
                                    { icon: 'bi-graph-up-arrow', color: '#f97316', text: 'Risk Stratification' },
                                    { icon: 'bi-capsule', color: '#14b8a6', text: 'Treatment Recommendations' },
                                    { icon: 'bi-file-earmark-medical-fill', color: '#0ea5e9', text: 'SOAP Note Documentation' },
                                ].map(({ icon, color, text }) => (
                                    <div key={text} className="d-flex align-items-center gap-3">
                                        <div className="d-flex align-items-center justify-content-center flex-shrink-0"
                                            style={{ width: 32, height: 32, borderRadius: '50%', background: color + '20' }}>
                                            <i className={`bi ${icon}`} style={{ color, fontSize: '0.9rem' }}></i>
                                        </div>
                                        <span style={{ fontSize: '0.95rem', color: '#374151' }}>{text}</span>
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={executeWorkflow}
                                disabled={!encounterId}
                                className="btn btn-lg w-100 text-white fw-semibold shadow-sm"
                                style={{ borderRadius: 12, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', fontSize: '1rem', padding: '12px' }}
                            >
                                <i className="bi bi-rocket-takeoff-fill me-2"></i>
                                Run AI Assessment
                            </button>
                            {!encounterId && (
                                <p className="text-muted small mt-2 mb-0">
                                    <i className="bi bi-info-circle me-1"></i>Please start an encounter first
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* ── LIVE WORKFLOW TRACKER (running or complete-with-steps) ── */}
                {(loading || (!loading && liveSteps.length > 0)) && (
                    <div className="mb-4">
                        <WorkflowTracker
                            steps={liveSteps}
                            orchestratorThought={loading ? orchestratorThought : ''}
                            hasImage={hasImage}
                            loading={loading}
                        />

                        {/* Re-run button — shown after any completed run (success or error) */}
                        {!loading && liveSteps.length > 0 && (
                            <div className="text-center mt-4 d-flex align-items-center justify-content-center gap-3">
                                <button
                                    onClick={executeWorkflow}
                                    disabled={!encounterId}
                                    className="btn btn-lg text-white fw-semibold shadow-sm"
                                    style={{
                                        borderRadius: 12,
                                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                        border: 'none',
                                        fontSize: '0.95rem',
                                        padding: '10px 28px',
                                    }}
                                >
                                    <i className="bi bi-arrow-repeat me-2"></i>Re-run AI Assessment
                                </button>
                                {ws && (
                                    <span className="small text-muted">
                                        <i className="bi bi-check-circle-fill text-success me-1"></i>
                                        Previous results shown below
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Error Display */}
                {error && (
                    <div className="alert alert-danger d-flex align-items-center mb-4" role="alert">
                        <i className="bi bi-exclamation-triangle-fill me-2 fs-5"></i>
                        <div>
                            <strong>Error:</strong> {error}
                            <button className="btn btn-sm btn-outline-danger ms-3" onClick={executeWorkflow}>
                                <i className="bi bi-arrow-repeat me-1"></i>Try Again
                            </button>
                        </div>
                    </div>
                )}

                {/* Results */}
                {ws && (
                    <div className="row g-4">

                        {/* ===== ROW 1: Triage + Risk ===== */}

                        {/* Triage Assessment */}
                        {ws.triage_level && (
                            <div className="col-md-6">
                                <AgentCard
                                    icon="bi-speedometer2"
                                    title="Triage Assessment"
                                    gradient="linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
                                    badge="Tool 1"
                                >
                                    <div className="text-center mb-3">
                                        <span
                                            className="badge px-4 py-3 fs-5 fw-bold"
                                            style={{
                                                background: getTriageColor(ws.triage_level).bg,
                                                color: getTriageColor(ws.triage_level).text,
                                                borderRadius: '30px'
                                            }}
                                        >
                                            {ws.triage_level.toUpperCase()}
                                        </span>
                                    </div>

                                    {ws.red_flags && ws.red_flags.length > 0 && (
                                        <div className="mt-3">
                                            <h6 className="text-danger fw-semibold">
                                                <i className="bi bi-flag-fill me-2"></i>
                                                Red Flags
                                            </h6>
                                            <ul className="list-unstyled mb-0">
                                                {ws.red_flags.map((flag, idx) => (
                                                    <li key={idx} className="d-flex align-items-start gap-2 mb-2">
                                                        <i className="bi bi-exclamation-circle-fill text-danger mt-1"></i>
                                                        <span>{flag}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {ws.triage_reasoning && (
                                        <details className="mt-3">
                                            <summary className="text-muted" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                                                <i className="bi bi-info-circle me-1"></i>View Reasoning
                                            </summary>
                                            <div className="mt-2 p-2 bg-light rounded" style={{ fontSize: '0.85rem' }}>
                                                <FormattedText text={ws.triage_reasoning} />
                                            </div>
                                        </details>
                                    )}
                                </AgentCard>
                            </div>
                        )}

                        {/* Risk Stratification */}
                        {ws.risk_level && (
                            <div className="col-md-6">
                                <AgentCard
                                    icon="bi-graph-up-arrow"
                                    title="Risk Stratification"
                                    gradient="linear-gradient(135deg, #f97316 0%, #ea580c 100%)"
                                    badge="Tool 3"
                                >
                                    <div className="text-center mb-3">
                                        <div
                                            className="d-inline-flex align-items-center justify-content-center rounded-circle mb-2"
                                            style={{
                                                width: '70px',
                                                height: '70px',
                                                background: getRiskColor(ws.risk_level).bg
                                            }}
                                        >
                                            <i className={`bi ${getRiskColor(ws.risk_level).icon} text-white fs-2`}></i>
                                        </div>
                                        <h4 className="mb-0 fw-bold" style={{ color: getRiskColor(ws.risk_level).bg }}>
                                            {ws.risk_level.replace('-', ' ').toUpperCase()}
                                        </h4>
                                    </div>

                                    {ws.risk_recommendations && ws.risk_recommendations.length > 0 && (
                                        <div>
                                            <h6 className="fw-semibold text-muted mb-2">Recommendations</h6>
                                            <ul className="list-unstyled mb-0">
                                                {ws.risk_recommendations.map((rec, idx) => (
                                                    <li key={idx} className="d-flex align-items-start gap-2 mb-2 p-2 bg-light rounded">
                                                        <i className="bi bi-arrow-right-circle-fill text-primary mt-1"></i>
                                                        <span style={{ fontSize: '0.9rem' }}>{rec}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </AgentCard>
                            </div>
                        )}

                        {/* ===== ROW 2: Vitals + Symptom Assessment ===== */}

                        {/* Vitals Analysis */}
                        {(ws.vitals_analysis || (ws.abnormal_vitals && ws.abnormal_vitals.length > 0)) && (
                            <div className="col-md-6">
                                <AgentCard
                                    icon="bi-heart-pulse-fill"
                                    title="Vitals Analysis"
                                    gradient="linear-gradient(135deg, #ec4899 0%, #db2777 100%)"
                                    badge="Tool 2"
                                >
                                    {ws.abnormal_vitals && ws.abnormal_vitals.length > 0 && (
                                        <div className="mb-3">
                                            <h6 className="fw-semibold text-danger mb-2">
                                                <i className="bi bi-exclamation-triangle me-1"></i>
                                                Abnormal Values
                                            </h6>
                                            <div className="d-flex flex-wrap gap-2">
                                                {ws.abnormal_vitals.map((v, i) => (
                                                    <span key={i} className="badge bg-danger bg-opacity-10 text-danger px-3 py-2" style={{ borderRadius: '8px', fontSize: '0.85rem' }}>
                                                        {v}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {ws.vitals_analysis && (
                                        <FormattedText text={ws.vitals_analysis} />
                                    )}
                                </AgentCard>
                            </div>
                        )}

                        {/* Symptom Assessment */}
                        {ws.assessment_summary && (
                            <div className="col-md-6">
                                <AgentCard
                                    icon="bi-clipboard2-pulse-fill"
                                    title="Symptom Assessment"
                                    gradient="linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)"
                                    badge="Tool 1"
                                >
                                    <FormattedText text={ws.assessment_summary} />

                                    {ws.suggested_questions && ws.suggested_questions.length > 0 && (
                                        <div className="mt-3 p-3 bg-light rounded-3">
                                            <h6 className="fw-semibold mb-2" style={{ fontSize: '0.85rem', color: '#4f46e5' }}>
                                                <i className="bi bi-question-circle me-1"></i>
                                                Follow-up Questions
                                            </h6>
                                            <ol className="mb-0 ps-3" style={{ fontSize: '0.85rem' }}>
                                                {ws.suggested_questions.map((q, i) => (
                                                    <li key={i} className="mb-1">{q}</li>
                                                ))}
                                            </ol>
                                        </div>
                                    )}
                                </AgentCard>
                            </div>
                        )}

                        {/* ===== ROW 3: Differential Diagnoses + Medications ===== */}

                        {/* Differential Diagnoses */}
                        {ws.differential_diagnoses && ws.differential_diagnoses.length > 0 && (
                            <div className="col-md-6">
                                <AgentCard
                                    icon="bi-diagram-3-fill"
                                    title="Differential Diagnoses"
                                    gradient="linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)"
                                    badge="Tool 1"
                                >
                                    {ws.primary_diagnosis && (
                                        <div className="alert alert-primary d-flex align-items-center mb-3 py-2" role="alert">
                                            <i className="bi bi-star-fill me-2"></i>
                                            <div><strong>Primary:</strong> {ws.primary_diagnosis}</div>
                                        </div>
                                    )}
                                    <ol className="mb-0">
                                        {ws.differential_diagnoses.map((dx, idx) => (
                                            <li key={idx} className="mb-1">{dx}</li>
                                        ))}
                                    </ol>
                                    {ws.diagnostic_reasoning && (
                                        <details className="mt-3">
                                            <summary className="text-muted" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                                                <i className="bi bi-info-circle me-1"></i>Diagnostic Reasoning
                                            </summary>
                                            <div className="mt-2 p-2 bg-light rounded" style={{ fontSize: '0.85rem' }}>
                                                <FormattedText text={ws.diagnostic_reasoning} />
                                            </div>
                                        </details>
                                    )}
                                </AgentCard>
                            </div>
                        )}

                        {/* Medications */}
                        {ws.medication_education && (
                            <div className="col-md-6">
                                <AgentCard
                                    icon="bi-capsule"
                                    title="Medication Review"
                                    gradient="linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)"
                                    badge="Tool 5"
                                >
                                    <FormattedText text={ws.medication_education} />
                                </AgentCard>
                            </div>
                        )}

                        {/* ===== ROW 4: Care Plan + Education ===== */}

                        {/* Care Plan */}
                        {((ws.care_plan_goals && ws.care_plan_goals.length > 0) || (ws.interventions && ws.interventions.length > 0)) && (
                            <div className="col-md-6">
                                <AgentCard
                                    icon="bi-journal-medical"
                                    title="Care Plan"
                                    gradient="linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)"
                                    badge="Tool 5"
                                >
                                    {ws.care_plan_goals && ws.care_plan_goals.length > 0 && (
                                        <div className="mb-3">
                                            <h6 className="fw-semibold mb-2" style={{ fontSize: '0.85rem', color: '#0284c7' }}>Goals</h6>
                                            <ul className="list-unstyled mb-0">
                                                {ws.care_plan_goals.map((goal, i) => (
                                                    <li key={i} className="d-flex align-items-start gap-2 mb-2">
                                                        <i className="bi bi-bullseye text-info mt-1"></i>
                                                        <span style={{ fontSize: '0.9rem' }}>{typeof goal === 'string' ? goal : goal.description || goal.goal || JSON.stringify(goal)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {ws.interventions && ws.interventions.length > 0 && (
                                        <div>
                                            <h6 className="fw-semibold mb-2" style={{ fontSize: '0.85rem', color: '#0284c7' }}>Interventions</h6>
                                            <ul className="list-unstyled mb-0">
                                                {ws.interventions.map((item, i) => (
                                                    <li key={i} className="d-flex align-items-start gap-2 mb-2">
                                                        <i className="bi bi-check2-circle text-success mt-1"></i>
                                                        <span style={{ fontSize: '0.9rem' }}>{item}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </AgentCard>
                            </div>
                        )}

                        {/* Patient Education */}
                        {ws.patient_education && (
                            <div className="col-md-6">
                                <AgentCard
                                    icon="bi-book-fill"
                                    title="Patient Education"
                                    gradient="linear-gradient(135deg, #a855f7 0%, #9333ea 100%)"
                                    badge="Tool 5"
                                >
                                    <FormattedText text={ws.patient_education} />
                                </AgentCard>
                            </div>
                        )}

                        {/* ===== ROW 5: Follow-up + Referral ===== */}

                        {/* Follow-up Plan */}
                        {(ws.follow_up_plan || ws.follow_up_timing || (ws.warning_signs && ws.warning_signs.length > 0)) && (
                            <div className="col-md-6">
                                <AgentCard
                                    icon="bi-calendar-check-fill"
                                    title="Follow-up Plan"
                                    gradient="linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
                                    badge="Tool 5"
                                >
                                    {ws.follow_up_timing && (
                                        <div className="mb-3 p-2 bg-warning bg-opacity-10 rounded d-flex align-items-center gap-2">
                                            <i className="bi bi-clock-fill text-warning"></i>
                                            <span className="fw-semibold">{ws.follow_up_timing}</span>
                                        </div>
                                    )}
                                    {ws.follow_up_plan && (
                                        <FormattedText text={ws.follow_up_plan} />
                                    )}
                                    {ws.warning_signs && ws.warning_signs.length > 0 && (
                                        <div className="mt-3">
                                            <h6 className="text-danger fw-semibold mb-2" style={{ fontSize: '0.85rem' }}>
                                                <i className="bi bi-exclamation-triangle me-1"></i>
                                                Warning Signs to Watch
                                            </h6>
                                            <ul className="list-unstyled mb-0">
                                                {ws.warning_signs.map((sign, i) => (
                                                    <li key={i} className="d-flex align-items-start gap-2 mb-1">
                                                        <i className="bi bi-exclamation-diamond text-danger mt-1" style={{ fontSize: '0.8rem' }}></i>
                                                        <span style={{ fontSize: '0.9rem' }}>{sign}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </AgentCard>
                            </div>
                        )}

                        {/* Referral */}
                        {ws.referral_needed && (
                            <div className="col-md-6">
                                <AgentCard
                                    icon="bi-send-fill"
                                    title="Referral"
                                    gradient="linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)"
                                    badge="Tool 6"
                                >
                                    <div className="d-flex flex-wrap gap-2 mb-3">
                                        {ws.referral_type && (
                                            <span className="badge bg-danger bg-opacity-10 text-danger px-3 py-2" style={{ borderRadius: '8px' }}>
                                                {ws.referral_type}
                                            </span>
                                        )}
                                        {ws.referral_urgency && (
                                            <span className="badge bg-warning bg-opacity-10 text-warning px-3 py-2" style={{ borderRadius: '8px' }}>
                                                {ws.referral_urgency}
                                            </span>
                                        )}
                                    </div>
                                    {ws.referral_documentation && (
                                        <FormattedText text={ws.referral_documentation} />
                                    )}
                                </AgentCard>
                            </div>
                        )}

                        {/* ===== SOAP Note - Full Width ===== */}
                        {ws.soap_note && (
                            <div className="col-12">
                                <AgentCard
                                    icon="bi-file-earmark-medical-fill"
                                    title="SOAP Note"
                                    gradient="linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)"
                                    badge="Tool 7"
                                >
                                    <SOAPNote data={ws.soap_note} />
                                </AgentCard>
                            </div>
                        )}

                        {/* ===== Tool Calls (NEW: Tool-Based Workflow) ===== */}
                        {ws.tool_calls && ws.tool_calls.length > 0 && (
                            <div className="col-12">
                                <div className="card border-0 shadow-sm" style={{ borderRadius: '16px', overflow: 'hidden' }}>
                                    <div
                                        className="card-header border-0 text-white py-3"
                                        style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                                    >
                                        <div className="d-flex align-items-center gap-2">
                                            <i className="bi bi-tools fs-4"></i>
                                            <h5 className="mb-0 fw-bold">MedGemma Tool Calls</h5>
                                            <span className="badge bg-white bg-opacity-20 ms-auto">Agentic Workflow</span>
                                        </div>
                                    </div>
                                    <div className="card-body">
                                        <div className="timeline">
                                            {ws.tool_calls.map((call, idx) => (
                                                <div key={idx} className="d-flex gap-3 mb-4">
                                                    <div className="text-center">
                                                        <div
                                                            className="badge bg-success rounded-circle d-flex align-items-center justify-content-center"
                                                            style={{ width: '36px', height: '36px', fontSize: '0.9rem' }}
                                                        >
                                                            {idx + 1}
                                                        </div>
                                                        {idx < ws.tool_calls.length - 1 && (
                                                            <div
                                                                className="mt-2"
                                                                style={{ width: '2px', height: '50px', background: '#d1fae5', marginLeft: '17px' }}
                                                            ></div>
                                                        )}
                                                    </div>
                                                    <div className="flex-grow-1 pb-2">
                                                        <div className="d-flex align-items-center gap-2 mb-2">
                                                            <i className="bi bi-wrench-adjustable text-success"></i>
                                                            <span className="fw-semibold text-success">
                                                                {call.tool_name.replace('medgemma_', '').replace(/_/g, ' ').toUpperCase()}
                                                            </span>
                                                            {call.timestamp && (
                                                                <span className="badge bg-light text-muted ms-auto" style={{ fontSize: '0.7rem' }}>
                                                                    {new Date(call.timestamp).toLocaleTimeString()}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="small text-muted mb-1">
                                                            <strong>Input:</strong> {call.input}
                                                        </div>
                                                        <div className="small text-secondary">
                                                            <strong>Output:</strong> {call.output}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ===== Workflow Trace (NEW: Shows orchestrator flow) ===== */}
                        {ws.workflow_trace && ws.workflow_trace.tools_used && (
                            <div className="col-12">
                                <div className="card border-0 shadow-sm" style={{ borderRadius: '16px', overflow: 'hidden' }}>
                                    <div
                                        className="card-header border-0 text-white py-3"
                                        style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' }}
                                    >
                                        <div className="d-flex align-items-center gap-2">
                                            <i className="bi bi-diagram-3-fill fs-4"></i>
                                            <h5 className="mb-0 fw-bold">Orchestrator Flow</h5>
                                            <span className="badge bg-white bg-opacity-20 ms-auto">
                                                {ws.workflow_trace.total_tools} tools
                                            </span>
                                        </div>
                                    </div>
                                    <div className="card-body py-3">
                                        <div className="d-flex align-items-center gap-2 flex-wrap">
                                            <span className="badge bg-primary bg-opacity-10 text-primary px-3 py-2">
                                                <i className="bi bi-cpu me-1"></i>Orchestrator
                                            </span>
                                            <i className="bi bi-arrow-right text-primary"></i>
                                            {ws.workflow_trace.tools_used.map((tool, idx) => (
                                                <React.Fragment key={idx}>
                                                    <span className="badge bg-success bg-opacity-10 text-success px-3 py-2">
                                                        <i className="bi bi-wrench me-1"></i>
                                                        {tool.replace('medgemma_', '').replace(/_/g, ' ')}
                                                    </span>
                                                    {idx < ws.workflow_trace.tools_used.length - 1 ? (
                                                        <>
                                                            <i className="bi bi-arrow-right text-success"></i>
                                                            <span className="badge bg-primary bg-opacity-10 text-primary px-3 py-2">
                                                                <i className="bi bi-cpu me-1"></i>Orchestrator
                                                            </span>
                                                            <i className="bi bi-arrow-right text-primary"></i>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <i className="bi bi-arrow-right text-primary"></i>
                                                            <span className="badge bg-info bg-opacity-10 text-info px-3 py-2">
                                                                <i className="bi bi-check-circle me-1"></i>Complete
                                                            </span>
                                                        </>
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ===== Workflow Status Bar ===== */}
                        <div className="col-12">
                            <div className="card border-0 shadow-sm" style={{ borderRadius: '16px' }}>
                                <div className="card-body py-3">
                                    <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                                        <div className="d-flex align-items-center gap-2">
                                            <i className="bi bi-info-circle-fill text-muted"></i>
                                            <span className="text-muted">Current Step:</span>
                                            <span className="fw-semibold">{ws.current_step}</span>
                                        </div>
                                        <div className="d-flex align-items-center gap-2">
                                            {ws.workflow_complete ? (
                                                <span className="badge bg-success px-3 py-2">
                                                    <i className="bi bi-check-circle-fill me-1"></i>
                                                    Complete
                                                </span>
                                            ) : (
                                                <span className="badge bg-warning text-dark px-3 py-2">
                                                    <i className="bi bi-hourglass-split me-1"></i>
                                                    In Progress
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </div>
    );
}
