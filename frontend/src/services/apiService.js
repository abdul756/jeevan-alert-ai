/**
 * API Service for VaidyaAI - CHW Clinical Decision Support
 * Connects frontend to LangGraph + FastAPI backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

class ApiService {
    constructor() {
        this.baseURL = API_BASE_URL;
    }

    // Helper method for API calls
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        };

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                const error = await response.json().catch(() => ({ detail: 'Request failed' }));
                throw new Error(error.detail || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            throw error;
        }
    }

    // ==================== PATIENTS API ====================
    async getPatients(limit = 50, offset = 0) {
        const data = await this.request(`/patients?limit=${limit}&offset=${offset}`);
        // Backend returns array, but frontend expects {patients: [...]}
        return { patients: Array.isArray(data) ? data : [] };
    }

    async getPatient(patientId) {
        return this.request(`/patients/${patientId}`);
    }

    async createPatient(patientData) {
        return this.request('/patients', {
            method: 'POST',
            body: JSON.stringify(patientData),
        });
    }

    async updatePatient(patientId, patientData) {
        return this.request(`/patients/${patientId}`, {
            method: 'PUT',
            body: JSON.stringify(patientData),
        });
    }

    async getPatientSummary(patientId) {
        return this.request(`/patients/${patientId}/summary`);
    }

    // ==================== ENCOUNTERS API ====================
    async createEncounter(encounterData) {
        return this.request('/encounters', {
            method: 'POST',
            body: JSON.stringify(encounterData),
        });
    }

    async getEncounter(encounterId) {
        return this.request(`/encounters/${encounterId}`);
    }

    async getPatientEncounters(patientId) {
        return this.request(`/encounters/patient/${patientId}`);
    }

    async updateEncounter(encounterId, encounterData) {
        return this.request(`/encounters/${encounterId}`, {
            method: 'PUT',
            body: JSON.stringify(encounterData),
        });
    }

    async startEncounter(encounterId) {
        return this.request(`/encounters/${encounterId}/start`, {
            method: 'POST',
        });
    }

    async completeEncounter(encounterId) {
        return this.request(`/encounters/${encounterId}/complete`, {
            method: 'POST',
        });
    }

    // ==================== LANGGRAPH WORKFLOW API ====================
    async executeToolWorkflow(encounterId, imagePath = null, imageType = null) {
        return this.request('/workflow/execute-tool-workflow', {
            method: 'POST',
            body: JSON.stringify({
                encounter_id: encounterId,
                image_path: imagePath,
                image_type: imageType,
            }),
        });
    }

    /**
     * Stream real-time workflow progress via SSE (Server-Sent Events).
     *
     * @param {string} encounterId
     * @param {function} onEvent  - called for each event: { type, ...fields }
     * @returns {Promise<void>}   - resolves when stream ends
     *
     * Event types:
     *   workflow_start  - workflow beginning
     *   orchestrator    - { reasoning, next_action }
     *   step_start      - { tool, label, description }
     *   step_complete   - { tool, label, ...tool-specific }
     *   interrupt       - { data: { triage_level, red_flags, ... } }
     *   complete        - { data: finalState }
     *   error           - { message }
     */
    async streamWorkflow(encounterId, onEvent) {
        const url = `${this.baseURL}/workflow/stream-workflow/${encounterId}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'text/event-stream' },
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ detail: 'Stream request failed' }));
            throw new Error(err.detail || `HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const event = JSON.parse(line.slice(6));
                        // Each event gets its own macrotask so React 18 flushes
                        // between events and the CHW sees live step transitions.
                        // Without this, multiple events in one read() chunk are
                        // batched by React and rendered all at once.
                        await new Promise(resolve =>
                            setTimeout(() => { onEvent(event); resolve(); }, 0)
                        );
                    } catch {
                        // ignore malformed frames
                    }
                }
            }
        }
    }

    async resumeWorkflow(encounterId, threadId, decision, chwNotes) {
        return this.request('/workflow/resume-workflow', {
            method: 'POST',
            body: JSON.stringify({
                encounter_id: encounterId,
                thread_id: threadId,
                decision: decision,  // "approve" or "reject"
                chw_notes: chwNotes,
            }),
        });
    }

    /**
     * Stream workflow resume progress via SSE.
     * Same event types as streamWorkflow plus "workflow_resume" on start.
     */
    async streamResumeWorkflow(encounterId, threadId, decision, chwNotes, onEvent) {
        const params = new URLSearchParams({
            thread_id: threadId,
            decision,
            chw_notes: chwNotes || '',
        });
        const url = `${this.baseURL}/workflow/stream-resume-workflow/${encounterId}?${params}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'text/event-stream' },
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ detail: 'Stream resume failed' }));
            throw new Error(err.detail || `HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const event = JSON.parse(line.slice(6));
                        await new Promise(resolve =>
                            setTimeout(() => { onEvent(event); resolve(); }, 0)
                        );
                    } catch {
                        // ignore malformed frames
                    }
                }
            }
        }
    }

    async uploadEncounterImage(encounterId, imageFile) {
        const formData = new FormData();
        formData.append('image', imageFile);

        return this.request(`/encounters/${encounterId}/upload-image`, {
            method: 'POST',
            headers: {}, // Let browser set multipart boundary
            body: formData,
        });
    }

    async getWorkflowStatus(encounterId) {
        return this.request(`/workflow/workflow-status/${encounterId}`);
    }

    // ==================== OBSERVATIONS API ====================
    async recordObservation(observationData) {
        return this.request('/observations', {
            method: 'POST',
            body: JSON.stringify(observationData),
        });
    }

    async getObservationsByEncounter(encounterId) {
        return this.request(`/observations/encounter/${encounterId}`);
    }

    async getObservationTrends(patientId, observationType, days = 30) {
        return this.request(
            `/observations/patient/${patientId}/trends?observation_type=${observationType}&days=${days}`
        );
    }

    async getAbnormalObservations() {
        return this.request('/observations/abnormal');
    }

    // ==================== MEDICATIONS API ====================
    async getPatientMedications(patientId) {
        return this.request(`/medications/patient/${patientId}`);
    }

    async addMedication(medicationData) {
        return this.request('/medications', {
            method: 'POST',
            body: JSON.stringify(medicationData),
        });
    }

    // ==================== RISK ASSESSMENTS API ====================
    async createRiskAssessment(assessmentData) {
        return this.request('/risk-assessments', {
            method: 'POST',
            body: JSON.stringify(assessmentData),
        });
    }

    async getPatientRiskScores(patientId) {
        return this.request(`/risk-assessments/patient/${patientId}/latest`);
    }

    // ==================== ANALYTICS API ====================
    async getDashboardData(days = 30) {
        return this.request(`/analytics/dashboard?days=${days}`);
    }

    async getEncounterTrends(days = 30) {
        return this.request(`/analytics/encounters/trends?days=${days}`);
    }

    async getConditionDistribution() {
        return this.request('/analytics/conditions/distribution');
    }

    async getAIUsageStats(days = 30) {
        return this.request(`/analytics/ai-usage?days=${days}`);
    }

    // ==================== SKIN ANALYSIS API (Charma Scan) ====================
    async analyzeSkinLesion(imageFile, metadata = {}) {
        const formData = new FormData();
        formData.append('image', imageFile);
        if (metadata.age) formData.append('age', metadata.age);
        if (metadata.sex) formData.append('sex', metadata.sex);
        if (metadata.site) formData.append('site', metadata.site);
        if (metadata.size_mm) formData.append('size_mm', metadata.size_mm);

        return this.request('/skin-analysis/analyze', {
            method: 'POST',
            headers: {},
            body: formData,
        });
    }

    async getSkinAnalysisStatus() {
        return this.request('/skin-analysis/status');
    }

    // ==================== PATIENT EDUCATION API ====================
    async getEducationTopics() {
        return this.request('/education/topics');
    }

    async generateEducation(topic, language = 'English', literacy_level = '8th-grade') {
        return this.request('/education/generate', {
            method: 'POST',
            body: JSON.stringify({ topic, language, literacy_level }),
        });
    }

    // ==================== HEALTH CHECK ====================
    async healthCheck() {
        return fetch(`${this.baseURL.replace('/api/v1', '')}/health`).then(r => r.json());
    }
}

// Export singleton instance
export default new ApiService();
