import React, { useState, useEffect } from 'react';
import apiService from '../services/apiService';
import VitalsEntry from './VitalsEntry';
import ImageUpload from './ImageUpload';
import { WorkflowTracker, EXPECTED_STEPS_BASE, EXPECTED_STEPS_SKIN } from './AIWorkflow';

// Skin-related keywords that trigger image upload option
const SKIN_KEYWORDS = [
    'skin', 'rash', 'lesion', 'mole', 'spot', 'growth', 'bump',
    'itchy', 'itch', 'red', 'discoloration', 'melanoma', 'nevus',
    'wart', 'blister', 'sore', 'ulcer', 'patch', 'freckle',
    'birthmark', 'acne', 'eczema', 'psoriasis', 'dermatitis',
    'hives', 'sunburn', 'burn', 'bruise', 'cut', 'wound'
];

function NewEncounter({ patientId, patientName, onComplete, onCancel }) {
    const [step, setStep] = useState(1); // 1: Encounter details, 2: Vitals, 3: AI Assessment
    const [encounterData, setEncounterData] = useState({
        chief_complaint: '',
        symptoms: '',
        symptom_duration: '',
        symptom_duration_unit: 'days'
    });
    const [encounterId, setEncounterId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Image upload state
    const [showImageUpload, setShowImageUpload] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [uploadError, setUploadError] = useState(null);

    // Live workflow tracking state
    const [liveSteps, setLiveSteps] = useState([]);
    const [orchestratorThought, setOrchestratorThought] = useState('');
    const [aiStreamActive, setAiStreamActive] = useState(false);

    // Detect skin-related keywords and show/hide image upload
    useEffect(() => {
        const text = `${encounterData.chief_complaint} ${encounterData.symptoms}`.toLowerCase();
        const hasSkinKeyword = SKIN_KEYWORDS.some(keyword => text.includes(keyword));
        setShowImageUpload(hasSkinKeyword);

        // Clear image if no longer relevant
        if (!hasSkinKeyword && selectedImage) {
            setSelectedImage(null);
            setImagePreview(null);
        }
    }, [encounterData.chief_complaint, encounterData.symptoms]);

    // Handle image selection
    const handleImageSelect = (file) => {
        setSelectedImage(file);

        // Create preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const handleImageRemove = () => {
        setSelectedImage(null);
        setImagePreview(null);
        setUploadError(null);
    };

    const handleEncounterSubmit = async (e) => {
        e.preventDefault();
        if (!encounterData.chief_complaint) {
            setError('Chief complaint is required');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const durationText = encounterData.symptom_duration && encounterData.symptom_duration_unit
                ? `${encounterData.symptom_duration} ${encounterData.symptom_duration_unit}`
                : undefined;

            if (encounterId) {
                await apiService.updateEncounter(encounterId, {
                    chief_complaint: encounterData.chief_complaint,
                    symptoms: encounterData.symptoms,
                    symptom_duration: durationText
                });
            } else {
                const encounter = await apiService.createEncounter({
                    patient_id: patientId,
                    encounter_type: 'home-visit',
                    chief_complaint: encounterData.chief_complaint,
                    symptoms: encounterData.symptoms,
                    symptom_duration: durationText
                });
                setEncounterId(encounter.id);
            }

            setStep(2);
        } catch (err) {
            setError(err.message || 'Failed to save encounter');
        } finally {
            setLoading(false);
        }
    };

    const handleVitalsComplete = () => {
        setStep(3);
    };

    const handleSkipVitals = () => {
        setStep(3);
    };

    const handleBackToEncounter = () => {
        setStep(1);
    };

    const handleRunAI = async () => {
        setLoading(true);
        setError('');
        setUploadError(null);
        setLiveSteps([]);
        setOrchestratorThought('');
        setAiStreamActive(false);

        try {
            let imagePath = null;

            // Upload image first if selected
            if (selectedImage) {
                try {
                    const uploadResult = await apiService.uploadEncounterImage(encounterId, selectedImage);
                    imagePath = uploadResult.image_path;
                } catch (uploadErr) {
                    setUploadError(uploadErr.message || 'Image upload failed');
                    setLoading(false);
                    return;
                }
            }

            setAiStreamActive(true);

            // Stream workflow with live progress
            await apiService.streamWorkflow(encounterId, (event) => {
                if (event.type === 'workflow_start') {
                    const template = event.has_image ? EXPECTED_STEPS_SKIN : EXPECTED_STEPS_BASE;
                    setLiveSteps(template.map(s => ({ ...s, status: 'waiting' })));

                } else if (event.type === 'orchestrator') {
                    setOrchestratorThought(event.reasoning || '');

                } else if (event.type === 'step_start') {
                    setLiveSteps(prev => prev.map(s =>
                        s.tool === event.tool
                            ? { ...s, status: 'running', label: event.label || s.label, description: event.description || s.description }
                            : s
                    ));

                } else if (event.type === 'step_complete') {
                    setLiveSteps(prev => prev.map(s =>
                        s.tool === event.tool
                            ? {
                                ...s, status: 'done', label: event.label || s.label,
                                triage_level: event.triage_level, red_flags: event.red_flags,
                                diagnoses: event.diagnoses, risk_level: event.risk_level
                            }
                            : s
                    ));

                } else if (event.type === 'complete' || event.type === 'interrupt') {
                    onComplete?.(event.data || event);

                } else if (event.type === 'error') {
                    setError(event.message || 'AI assessment failed');
                }
            });
        } catch (err) {
            setError(err.message || 'AI assessment failed');
        } finally {
            setLoading(false);
            setAiStreamActive(false);
        }
    };

    // Step Indicator Component
    const StepIndicator = () => (
        <div className="d-flex justify-content-center mb-3">
            <div className="d-flex align-items-center">
                {[1, 2, 3].map((s, idx) => (
                    <React.Fragment key={s}>
                        <div
                            className={`rounded-circle d-flex align-items-center justify-content-center ${step >= s ? 'text-white' : 'text-muted bg-light'}`}
                            style={{
                                width: '32px',
                                height: '32px',
                                background: step >= s ? 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)' : undefined,
                                fontWeight: '600',
                                fontSize: '0.85rem'
                            }}
                        >
                            {step > s ? <i className="bi bi-check-lg" style={{ fontSize: '0.8rem' }}></i> : s}
                        </div>
                        {idx < 2 && (
                            <div
                                style={{
                                    width: '50px',
                                    height: '2px',
                                    background: step > s ? 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)' : '#e5e7eb',
                                    margin: '0 6px'
                                }}
                            ></div>
                        )}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );

    // Step 1: Encounter Details
    if (step === 1) {
        return (
            <div
                className="modal fade show d-block"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                onClick={onCancel}
            >
                <div
                    className="modal-dialog modal-lg modal-dialog-centered"
                    onClick={(e) => e.stopPropagation()}
                    style={{ maxWidth: '800px' }}
                >
                    <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                        {/* Header */}
                        <div
                            className="modal-header border-0 text-white py-3"
                            style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', flexShrink: 0 }}
                        >
                            <div className="d-flex align-items-center gap-3">
                                <div
                                    className="rounded-circle d-flex align-items-center justify-content-center"
                                    style={{ width: '44px', height: '44px', background: 'rgba(255,255,255,0.2)' }}
                                >
                                    <i className="bi bi-clipboard2-pulse-fill fs-5"></i>
                                </div>
                                <div>
                                    <h5 className="modal-title mb-0 fw-bold fs-6">New Clinical Encounter</h5>
                                    <small className="opacity-75" style={{ fontSize: '0.8rem' }}>Patient: {patientName}</small>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="btn-close btn-close-white"
                                onClick={onCancel}
                            ></button>
                        </div>

                        {/* Body */}
                        <form onSubmit={handleEncounterSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                            <div className="modal-body p-4" style={{ background: '#f8fafc', overflowY: 'auto', flex: 1, scrollBehavior: 'smooth' }}>
                                <StepIndicator />

                                {error && (
                                    <div className="alert alert-danger d-flex align-items-center mb-4" role="alert">
                                        <i className="bi bi-exclamation-triangle-fill me-2"></i>
                                        {error}
                                    </div>
                                )}

                                <div className="row g-3">
                                    {/* Chief Complaint Card */}
                                    <div className="col-12">
                                        <div className="card border-0 shadow-sm" style={{ borderRadius: '10px' }}>
                                            <div className="card-body p-3">
                                                <div className="d-flex align-items-center gap-2 mb-2">
                                                    <div
                                                        className="rounded-circle d-flex align-items-center justify-content-center"
                                                        style={{
                                                            width: '36px',
                                                            height: '36px',
                                                            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                                            color: 'white',
                                                            fontSize: '0.9rem'
                                                        }}
                                                    >
                                                        <i className="bi bi-exclamation-circle-fill"></i>
                                                    </div>
                                                    <div>
                                                        <h6 className="mb-0 fw-semibold" style={{ fontSize: '0.95rem' }}>Chief Complaint <span className="text-danger">*</span></h6>
                                                        <small className="text-muted" style={{ fontSize: '0.75rem' }}>Primary reason for visit</small>
                                                    </div>
                                                </div>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-lg"
                                                    value={encounterData.chief_complaint}
                                                    onChange={(e) => setEncounterData({ ...encounterData, chief_complaint: e.target.value })}
                                                    placeholder="e.g., Fever and cough for 3 days"
                                                    required
                                                    style={{ borderRadius: '10px' }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Symptoms Description Card */}
                                    <div className="col-12">
                                        <div className="card border-0 shadow-sm" style={{ borderRadius: '10px' }}>
                                            <div className="card-body p-3">
                                                <div className="d-flex align-items-center gap-2 mb-2">
                                                    <div
                                                        className="rounded-circle d-flex align-items-center justify-content-center"
                                                        style={{
                                                            width: '36px',
                                                            height: '36px',
                                                            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                                                            color: 'white',
                                                            fontSize: '0.9rem'
                                                        }}
                                                    >
                                                        <i className="bi bi-list-check"></i>
                                                    </div>
                                                    <div>
                                                        <h6 className="mb-0 fw-semibold" style={{ fontSize: '0.95rem' }}>Symptoms Description</h6>
                                                        <small className="text-muted" style={{ fontSize: '0.75rem' }}>Detailed symptom information</small>
                                                    </div>
                                                </div>
                                                <textarea
                                                    className="form-control"
                                                    value={encounterData.symptoms}
                                                    onChange={(e) => setEncounterData({ ...encounterData, symptoms: e.target.value })}
                                                    placeholder="Describe all symptoms in detail...&#10;• What symptoms are present?&#10;• When did they start?&#10;• Are they getting better or worse?"
                                                    rows="3"
                                                    style={{ borderRadius: '8px', fontSize: '0.9rem' }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Duration Card */}
                                    <div className="col-12">
                                        <div className="card border-0 shadow-sm" style={{ borderRadius: '10px' }}>
                                            <div className="card-body p-3">
                                                <div className="d-flex align-items-center gap-2 mb-2">
                                                    <div
                                                        className="rounded-circle d-flex align-items-center justify-content-center"
                                                        style={{
                                                            width: '36px',
                                                            height: '36px',
                                                            background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                                                            color: 'white',
                                                            fontSize: '0.9rem'
                                                        }}
                                                    >
                                                        <i className="bi bi-clock-history"></i>
                                                    </div>
                                                    <div>
                                                        <h6 className="mb-0 fw-semibold" style={{ fontSize: '0.95rem' }}>Symptom Duration</h6>
                                                        <small className="text-muted" style={{ fontSize: '0.75rem' }}>How long have symptoms been present?</small>
                                                    </div>
                                                </div>
                                                <div className="row g-2">
                                                    <div className="col-6">
                                                        <input
                                                            type="number"
                                                            className="form-control text-center"
                                                            value={encounterData.symptom_duration}
                                                            onChange={(e) => setEncounterData({ ...encounterData, symptom_duration: e.target.value })}
                                                            placeholder="25"
                                                            min="0"
                                                            style={{ borderRadius: '8px', fontSize: '0.9rem' }}
                                                        />
                                                    </div>
                                                    <div className="col-6">
                                                        <select
                                                            className="form-select"
                                                            value={encounterData.symptom_duration_unit}
                                                            onChange={(e) => setEncounterData({ ...encounterData, symptom_duration_unit: e.target.value })}
                                                            style={{ borderRadius: '8px', fontSize: '0.9rem' }}
                                                        >
                                                            <option value="hours">Hours</option>
                                                            <option value="days">Days</option>
                                                            <option value="weeks">Weeks</option>
                                                            <option value="months">Months</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Conditional Skin Lesion Image Upload */}
                                    {showImageUpload && (
                                        <div className="col-12">
                                            <div
                                                className="card border-2 shadow-sm"
                                                style={{
                                                    borderRadius: '10px',
                                                    borderColor: '#60a5fa',
                                                    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
                                                }}
                                            >
                                                <div className="card-body p-3">
                                                    <div className="d-flex align-items-center gap-2 mb-2">
                                                        <div
                                                            className="rounded-circle d-flex align-items-center justify-content-center"
                                                            style={{
                                                                width: '36px',
                                                                height: '36px',
                                                                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                                                color: 'white',
                                                                fontSize: '0.9rem'
                                                            }}
                                                        >
                                                            <i className="bi bi-camera-fill"></i>
                                                        </div>
                                                        <div className="flex-grow-1">
                                                            <h6 className="mb-0 fw-semibold" style={{ color: '#1e40af', fontSize: '0.95rem' }}>
                                                                Skin Lesion Image <span className="badge bg-info ms-2" style={{ fontSize: '0.7rem' }}>Optional</span>
                                                            </h6>
                                                            <small style={{ color: '#1e40af', fontSize: '0.75rem' }}>
                                                                Upload a photo for AI-powered analysis
                                                            </small>
                                                        </div>
                                                    </div>
                                                    <div className="alert alert-info d-flex align-items-start mb-2 py-2" role="alert" style={{ fontSize: '0.85rem' }}>
                                                        <i className="bi bi-info-circle-fill me-2 mt-1" style={{ fontSize: '0.9rem' }}></i>
                                                        <div>
                                                            <strong>Skin-related complaint detected!</strong>
                                                            <br />
                                                            Upload an image for AI-powered skin cancer screening using our ISIC fine-tuned MedGemma model.
                                                        </div>
                                                    </div>
                                                    <ImageUpload
                                                        onImageSelect={handleImageSelect}
                                                        onImageRemove={handleImageRemove}
                                                        imagePreview={imagePreview}
                                                        error={uploadError}
                                                        onError={setUploadError}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="modal-footer border-0 bg-white py-2 px-4" style={{ flexShrink: 0 }}>
                                <button
                                    type="button"
                                    className="btn btn-light px-4"
                                    onClick={onCancel}
                                    style={{ borderRadius: '8px', fontSize: '0.9rem' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn px-4 text-white"
                                    disabled={loading}
                                    style={{
                                        borderRadius: '8px',
                                        background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                                        border: 'none',
                                        fontSize: '0.9rem'
                                    }}
                                >
                                    {loading ? (
                                        <>
                                            <span className="spinner-border spinner-border-sm me-2"></span>
                                            Creating...
                                        </>
                                    ) : (
                                        <>
                                            Next: Record Vitals
                                            <i className="bi bi-arrow-right ms-2"></i>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    // Step 2: Vitals Entry
    if (step === 2) {
        return (
            <>
                <VitalsEntry
                    patientId={patientId}
                    encounterId={encounterId}
                    onComplete={handleVitalsComplete}
                    onCancel={handleSkipVitals}
                />
                <div style={{
                    position: 'fixed',
                    bottom: '20px',
                    left: '20px',
                    zIndex: 10001
                }}>
                    <button
                        className="btn btn-light btn-lg shadow"
                        onClick={handleBackToEncounter}
                        style={{ borderRadius: '10px' }}
                    >
                        <i className="bi bi-arrow-left me-2"></i>
                        Back to Details
                    </button>
                </div>
                <div style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    zIndex: 10001
                }}>
                    <button
                        className="btn btn-warning btn-lg shadow"
                        onClick={handleSkipVitals}
                        style={{ borderRadius: '10px' }}
                    >
                        Skip Vitals
                        <i className="bi bi-skip-forward-fill ms-2"></i>
                    </button>
                </div>
            </>
        );
    }

    // Step 3: AI Assessment
    if (step === 3) {
        return (
            <div
                className="modal fade show d-block"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            >
                <div
                    className="modal-dialog modal-dialog-centered"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
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
                                    <i className="bi bi-cpu-fill fs-4"></i>
                                </div>
                                <div>
                                    <h5 className="modal-title mb-0 fw-bold">AI Clinical Assessment</h5>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="btn-close btn-close-white"
                                onClick={onCancel}
                            ></button>
                        </div>

                        {/* Body */}
                        <div className="modal-body p-4" style={{ background: '#f8fafc' }}>
                            <StepIndicator />

                            {error && (
                                <div className="alert alert-danger d-flex align-items-center mb-4" role="alert">
                                    <i className="bi bi-exclamation-triangle-fill me-2"></i>
                                    {error}
                                </div>
                            )}

                            {/* AI Info Card — replaced by WorkflowTracker once streaming starts */}
                            {aiStreamActive && liveSteps.length > 0 ? (
                                <WorkflowTracker
                                    steps={liveSteps}
                                    orchestratorThought={orchestratorThought}
                                    hasImage={!!selectedImage}
                                    loading={loading}
                                />
                            ) : (
                                <div className="card border-0 shadow-sm" style={{ borderRadius: '12px', background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' }}>
                                    <div className="card-body text-center py-4">
                                        <div
                                            className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3"
                                            style={{
                                                width: '80px',
                                                height: '80px',
                                                background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
                                                color: 'white',
                                                fontSize: '2rem'
                                            }}
                                        >
                                            🧠
                                        </div>
                                        <h5 className="fw-bold text-success mb-3">Ready for AI Analysis</h5>
                                        <p className="text-muted mb-4">The AI will analyze patient data, vitals, and symptoms to provide:</p>

                                        <div className="row g-3 text-start">
                                            {[
                                                { icon: 'bi-speedometer2', text: 'Triage Assessment', color: '#ef4444' },
                                                { icon: 'bi-diagram-3', text: 'Differential Diagnoses', color: '#f97316' },
                                                { icon: 'bi-graph-up', text: 'Risk Stratification', color: '#eab308' },
                                                { icon: 'bi-capsule', text: 'Treatment Recommendations', color: '#22c55e' },
                                                { icon: 'bi-file-earmark-medical', text: 'SOAP Note Documentation', color: '#3b82f6' },
                                            ].map((item, idx) => (
                                                <div key={idx} className="col-12">
                                                    <div className="d-flex align-items-center gap-3 p-2 bg-white rounded-3">
                                                        <div
                                                            className="rounded-circle d-flex align-items-center justify-content-center"
                                                            style={{
                                                                width: '36px',
                                                                height: '36px',
                                                                background: item.color,
                                                                color: 'white',
                                                                flexShrink: 0
                                                            }}
                                                        >
                                                            <i className={`bi ${item.icon}`}></i>
                                                        </div>
                                                        <span className="fw-medium">{item.text}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="modal-footer border-0 bg-white py-3 px-4">
                            <button
                                type="button"
                                className="btn btn-light btn-lg px-4 me-auto"
                                onClick={() => setStep(2)}
                                disabled={loading}
                                style={{ borderRadius: '10px' }}
                            >
                                <i className="bi bi-arrow-left me-2"></i>
                                Back
                            </button>
                            <button
                                type="button"
                                className="btn btn-outline-secondary btn-lg px-4"
                                onClick={onCancel}
                                disabled={loading}
                                style={{ borderRadius: '10px' }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-lg px-4 text-white"
                                onClick={handleRunAI}
                                disabled={loading}
                                style={{
                                    borderRadius: '10px',
                                    background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
                                    border: 'none'
                                }}
                            >
                                {loading ? (
                                    <>
                                        <span className="spinner-border spinner-border-sm me-2"></span>
                                        Analyzing...
                                    </>
                                ) : (
                                    <>
                                        <i className="bi bi-rocket-takeoff-fill me-2"></i>
                                        Run AI Assessment
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}

export default NewEncounter;
