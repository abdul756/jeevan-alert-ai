import React, { useState } from 'react';
import apiService from '../services/apiService';

function VitalsEntry({ patientId, encounterId, onComplete, onCancel }) {
    const [vitals, setVitals] = useState({
        systolic: '',
        diastolic: '',
        heartRate: '',
        temperature: '',
        spo2: '',
        respiratoryRate: '',
        weight: '',
        height: ''
    });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Blood Pressure
            if (vitals.systolic && vitals.diastolic) {
                await apiService.recordObservation({
                    patient_id: patientId,
                    encounter_id: encounterId,
                    observation_type: 'blood-pressure',
                    value: parseFloat(vitals.systolic),
                    value_secondary: parseFloat(vitals.diastolic),
                    unit: 'mmHg'
                });
            }

            // Heart Rate
            if (vitals.heartRate) {
                await apiService.recordObservation({
                    patient_id: patientId,
                    encounter_id: encounterId,
                    observation_type: 'heart-rate',
                    value: parseFloat(vitals.heartRate),
                    unit: 'bpm'
                });
            }

            // Temperature
            if (vitals.temperature) {
                await apiService.recordObservation({
                    patient_id: patientId,
                    encounter_id: encounterId,
                    observation_type: 'temperature',
                    value: parseFloat(vitals.temperature),
                    unit: '°F'
                });
            }

            // SpO2
            if (vitals.spo2) {
                await apiService.recordObservation({
                    patient_id: patientId,
                    encounter_id: encounterId,
                    observation_type: 'spo2',
                    value: parseFloat(vitals.spo2),
                    unit: '%'
                });
            }

            // Respiratory Rate
            if (vitals.respiratoryRate) {
                await apiService.recordObservation({
                    patient_id: patientId,
                    encounter_id: encounterId,
                    observation_type: 'respiratory-rate',
                    value: parseFloat(vitals.respiratoryRate),
                    unit: 'breaths/min'
                });
            }

            // Weight
            if (vitals.weight) {
                await apiService.recordObservation({
                    patient_id: patientId,
                    encounter_id: encounterId,
                    observation_type: 'weight',
                    value: parseFloat(vitals.weight),
                    unit: 'kg'
                });
            }

            // Height
            if (vitals.height) {
                await apiService.recordObservation({
                    patient_id: patientId,
                    encounter_id: encounterId,
                    observation_type: 'height',
                    value: parseFloat(vitals.height),
                    unit: 'cm'
                });
            }

            onComplete?.();
        } catch (error) {
            alert('Failed to record vitals: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Helper to get status color based on value
    const getBPStatus = () => {
        if (!vitals.systolic || !vitals.diastolic) return null;
        const sys = parseFloat(vitals.systolic);
        const dia = parseFloat(vitals.diastolic);
        if (sys >= 180 || dia >= 120) return { color: 'danger', text: 'Critical' };
        if (sys >= 140 || dia >= 90) return { color: 'warning', text: 'High' };
        if (sys < 90 || dia < 60) return { color: 'info', text: 'Low' };
        return { color: 'success', text: 'Normal' };
    };

    const getHeartRateStatus = () => {
        if (!vitals.heartRate) return null;
        const hr = parseFloat(vitals.heartRate);
        if (hr > 100) return { color: 'warning', text: 'Tachycardia' };
        if (hr < 60) return { color: 'info', text: 'Bradycardia' };
        return { color: 'success', text: 'Normal' };
    };

    const getTempStatus = () => {
        if (!vitals.temperature) return null;
        const temp = parseFloat(vitals.temperature);
        if (temp >= 103) return { color: 'danger', text: 'High Fever' };
        if (temp >= 100.4) return { color: 'warning', text: 'Fever' };
        if (temp < 97) return { color: 'info', text: 'Low' };
        return { color: 'success', text: 'Normal' };
    };

    const getSpo2Status = () => {
        if (!vitals.spo2) return null;
        const spo2 = parseFloat(vitals.spo2);
        if (spo2 < 90) return { color: 'danger', text: 'Critical' };
        if (spo2 < 95) return { color: 'warning', text: 'Low' };
        return { color: 'success', text: 'Normal' };
    };

    const bpStatus = getBPStatus();
    const hrStatus = getHeartRateStatus();
    const tempStatus = getTempStatus();
    const spo2Status = getSpo2Status();

    return (
        <div
            className="modal fade show d-block"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={onCancel}
        >
            <div
                className="modal-dialog modal-lg modal-dialog-centered"
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
                                <i className="bi bi-heart-pulse-fill fs-4"></i>
                            </div>
                            <div>
                                <h5 className="modal-title mb-0 fw-bold">Record Vital Signs</h5>
                                <small className="opacity-75">Enter patient measurements</small>
                            </div>
                        </div>
                        <button
                            type="button"
                            className="btn-close btn-close-white"
                            onClick={onCancel}
                        ></button>
                    </div>

                    {/* Body */}
                    <form onSubmit={handleSubmit}>
                        <div className="modal-body p-4" style={{ background: '#f8fafc' }}>
                            <div className="row g-4">
                                {/* Blood Pressure Card */}
                                <div className="col-md-6">
                                    <div className="card h-100 border-0 shadow-sm" style={{ borderRadius: '12px' }}>
                                        <div className="card-body">
                                            <div className="d-flex align-items-center gap-2 mb-3">
                                                <div
                                                    className="rounded-circle d-flex align-items-center justify-content-center"
                                                    style={{
                                                        width: '40px',
                                                        height: '40px',
                                                        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                                        color: 'white'
                                                    }}
                                                >
                                                    <i className="bi bi-heart-fill"></i>
                                                </div>
                                                <div>
                                                    <h6 className="mb-0 fw-semibold">Blood Pressure</h6>
                                                    {bpStatus && (
                                                        <span className={`badge bg-${bpStatus.color} bg-opacity-10 text-${bpStatus.color}`}>
                                                            {bpStatus.text}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="d-flex align-items-center gap-2">
                                                <input
                                                    type="number"
                                                    className="form-control form-control-lg text-center"
                                                    value={vitals.systolic}
                                                    onChange={(e) => setVitals({ ...vitals, systolic: e.target.value })}
                                                    placeholder="SYS"
                                                    min="40"
                                                    max="300"
                                                    style={{ borderRadius: '10px' }}
                                                />
                                                <span className="fs-4 text-muted">/</span>
                                                <input
                                                    type="number"
                                                    className="form-control form-control-lg text-center"
                                                    value={vitals.diastolic}
                                                    onChange={(e) => setVitals({ ...vitals, diastolic: e.target.value })}
                                                    placeholder="DIA"
                                                    min="20"
                                                    max="200"
                                                    style={{ borderRadius: '10px' }}
                                                />
                                                <span className="text-muted fw-medium">mmHg</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Heart Rate Card */}
                                <div className="col-md-6">
                                    <div className="card h-100 border-0 shadow-sm" style={{ borderRadius: '12px' }}>
                                        <div className="card-body">
                                            <div className="d-flex align-items-center gap-2 mb-3">
                                                <div
                                                    className="rounded-circle d-flex align-items-center justify-content-center"
                                                    style={{
                                                        width: '40px',
                                                        height: '40px',
                                                        background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                                                        color: 'white'
                                                    }}
                                                >
                                                    <i className="bi bi-activity"></i>
                                                </div>
                                                <div>
                                                    <h6 className="mb-0 fw-semibold">Heart Rate</h6>
                                                    {hrStatus && (
                                                        <span className={`badge bg-${hrStatus.color} bg-opacity-10 text-${hrStatus.color}`}>
                                                            {hrStatus.text}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="input-group input-group-lg">
                                                <input
                                                    type="number"
                                                    className="form-control text-center"
                                                    value={vitals.heartRate}
                                                    onChange={(e) => setVitals({ ...vitals, heartRate: e.target.value })}
                                                    placeholder="Enter rate"
                                                    min="30"
                                                    max="250"
                                                    style={{ borderRadius: '10px 0 0 10px' }}
                                                />
                                                <span className="input-group-text bg-light" style={{ borderRadius: '0 10px 10px 0' }}>bpm</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Temperature Card */}
                                <div className="col-md-6">
                                    <div className="card h-100 border-0 shadow-sm" style={{ borderRadius: '12px' }}>
                                        <div className="card-body">
                                            <div className="d-flex align-items-center gap-2 mb-3">
                                                <div
                                                    className="rounded-circle d-flex align-items-center justify-content-center"
                                                    style={{
                                                        width: '40px',
                                                        height: '40px',
                                                        background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
                                                        color: 'white'
                                                    }}
                                                >
                                                    <i className="bi bi-thermometer-half"></i>
                                                </div>
                                                <div>
                                                    <h6 className="mb-0 fw-semibold">Temperature</h6>
                                                    {tempStatus && (
                                                        <span className={`badge bg-${tempStatus.color} bg-opacity-10 text-${tempStatus.color}`}>
                                                            {tempStatus.text}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="input-group input-group-lg">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    className="form-control text-center"
                                                    value={vitals.temperature}
                                                    onChange={(e) => setVitals({ ...vitals, temperature: e.target.value })}
                                                    placeholder="Enter temp"
                                                    min="90"
                                                    max="110"
                                                    style={{ borderRadius: '10px 0 0 10px' }}
                                                />
                                                <span className="input-group-text bg-light" style={{ borderRadius: '0 10px 10px 0' }}>°F</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* SpO2 Card */}
                                <div className="col-md-6">
                                    <div className="card h-100 border-0 shadow-sm" style={{ borderRadius: '12px' }}>
                                        <div className="card-body">
                                            <div className="d-flex align-items-center gap-2 mb-3">
                                                <div
                                                    className="rounded-circle d-flex align-items-center justify-content-center"
                                                    style={{
                                                        width: '40px',
                                                        height: '40px',
                                                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                                        color: 'white'
                                                    }}
                                                >
                                                    <i className="bi bi-lungs-fill"></i>
                                                </div>
                                                <div>
                                                    <h6 className="mb-0 fw-semibold">SpO₂</h6>
                                                    {spo2Status && (
                                                        <span className={`badge bg-${spo2Status.color} bg-opacity-10 text-${spo2Status.color}`}>
                                                            {spo2Status.text}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="input-group input-group-lg">
                                                <input
                                                    type="number"
                                                    className="form-control text-center"
                                                    value={vitals.spo2}
                                                    onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })}
                                                    placeholder="Enter value"
                                                    min="50"
                                                    max="100"
                                                    style={{ borderRadius: '10px 0 0 10px' }}
                                                />
                                                <span className="input-group-text bg-light" style={{ borderRadius: '0 10px 10px 0' }}>%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Respiratory Rate Card */}
                                <div className="col-md-6">
                                    <div className="card h-100 border-0 shadow-sm" style={{ borderRadius: '12px' }}>
                                        <div className="card-body">
                                            <div className="d-flex align-items-center gap-2 mb-3">
                                                <div
                                                    className="rounded-circle d-flex align-items-center justify-content-center"
                                                    style={{
                                                        width: '40px',
                                                        height: '40px',
                                                        background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                                                        color: 'white'
                                                    }}
                                                >
                                                    <i className="bi bi-wind"></i>
                                                </div>
                                                <div>
                                                    <h6 className="mb-0 fw-semibold">Respiratory Rate</h6>
                                                </div>
                                            </div>
                                            <div className="input-group input-group-lg">
                                                <input
                                                    type="number"
                                                    className="form-control text-center"
                                                    value={vitals.respiratoryRate}
                                                    onChange={(e) => setVitals({ ...vitals, respiratoryRate: e.target.value })}
                                                    placeholder="Enter rate"
                                                    min="5"
                                                    max="60"
                                                    style={{ borderRadius: '10px 0 0 10px' }}
                                                />
                                                <span className="input-group-text bg-light" style={{ borderRadius: '0 10px 10px 0' }}>br/min</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Weight Card */}
                                <div className="col-md-6">
                                    <div className="card h-100 border-0 shadow-sm" style={{ borderRadius: '12px' }}>
                                        <div className="card-body">
                                            <div className="d-flex align-items-center gap-2 mb-3">
                                                <div
                                                    className="rounded-circle d-flex align-items-center justify-content-center"
                                                    style={{
                                                        width: '40px',
                                                        height: '40px',
                                                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                        color: 'white'
                                                    }}
                                                >
                                                    <i className="bi bi-speedometer2"></i>
                                                </div>
                                                <div>
                                                    <h6 className="mb-0 fw-semibold">Weight</h6>
                                                </div>
                                            </div>
                                            <div className="input-group input-group-lg">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    className="form-control text-center"
                                                    value={vitals.weight}
                                                    onChange={(e) => setVitals({ ...vitals, weight: e.target.value })}
                                                    placeholder="Enter weight"
                                                    style={{ borderRadius: '10px 0 0 10px' }}
                                                />
                                                <span className="input-group-text bg-light" style={{ borderRadius: '0 10px 10px 0' }}>kg</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Height Card */}
                                <div className="col-md-6">
                                    <div className="card h-100 border-0 shadow-sm" style={{ borderRadius: '12px' }}>
                                        <div className="card-body">
                                            <div className="d-flex align-items-center gap-2 mb-3">
                                                <div
                                                    className="rounded-circle d-flex align-items-center justify-content-center"
                                                    style={{
                                                        width: '40px',
                                                        height: '40px',
                                                        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                                        color: 'white'
                                                    }}
                                                >
                                                    <i className="bi bi-rulers"></i>
                                                </div>
                                                <div>
                                                    <h6 className="mb-0 fw-semibold">Height</h6>
                                                </div>
                                            </div>
                                            <div className="input-group input-group-lg">
                                                <input
                                                    type="number"
                                                    className="form-control text-center"
                                                    value={vitals.height}
                                                    onChange={(e) => setVitals({ ...vitals, height: e.target.value })}
                                                    placeholder="Enter height"
                                                    style={{ borderRadius: '10px 0 0 10px' }}
                                                />
                                                <span className="input-group-text bg-light" style={{ borderRadius: '0 10px 10px 0' }}>cm</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* BMI Card (calculated) */}
                                <div className="col-md-6">
                                    <div className="card h-100 border-0 shadow-sm" style={{ borderRadius: '12px', background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' }}>
                                        <div className="card-body">
                                            <div className="d-flex align-items-center gap-2 mb-3">
                                                <div
                                                    className="rounded-circle d-flex align-items-center justify-content-center"
                                                    style={{
                                                        width: '40px',
                                                        height: '40px',
                                                        background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
                                                        color: 'white'
                                                    }}
                                                >
                                                    <i className="bi bi-calculator"></i>
                                                </div>
                                                <div>
                                                    <h6 className="mb-0 fw-semibold">BMI (Calculated)</h6>
                                                </div>
                                            </div>
                                            <div className="text-center">
                                                {vitals.weight && vitals.height ? (
                                                    <>
                                                        <span className="display-6 fw-bold text-success">
                                                            {(parseFloat(vitals.weight) / Math.pow(parseFloat(vitals.height) / 100, 2)).toFixed(1)}
                                                        </span>
                                                        <p className="text-muted mb-0 mt-1">
                                                            {(() => {
                                                                const bmi = parseFloat(vitals.weight) / Math.pow(parseFloat(vitals.height) / 100, 2);
                                                                if (bmi < 18.5) return 'Underweight';
                                                                if (bmi < 25) return 'Normal';
                                                                if (bmi < 30) return 'Overweight';
                                                                return 'Obese';
                                                            })()}
                                                        </p>
                                                    </>
                                                ) : (
                                                    <span className="text-muted">Enter weight & height</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="modal-footer border-0 bg-white py-3 px-4">
                            <button
                                type="button"
                                className="btn btn-light btn-lg px-4"
                                onClick={onCancel}
                                style={{ borderRadius: '10px' }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="btn btn-lg px-4 text-white"
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
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <i className="bi bi-check2-circle me-2"></i>
                                        Save Vitals
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

export default VitalsEntry;
