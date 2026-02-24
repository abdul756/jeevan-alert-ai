/**
 * Encounter PDF Generator
 * Generates a professional PDF report matching the encounter details modal.
 * Uses jsPDF + jspdf-autotable (already installed).
 */
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';

// Apply the autoTable plugin to jsPDF
applyPlugin(jsPDF);

// Color constants (matching the UI)
const COLORS = {
    primary: [30, 64, 175],      // #1e40af - Clinical Assessment
    danger: [220, 38, 38],       // #dc2626 - Red Flags
    purple: [124, 58, 237],      // #7c3aed - Investigations
    green: [5, 150, 105],        // #059669 - Treatment Plan
    teal: [13, 148, 136],        // #0d9488 - AI Assessment header
    sky: [3, 105, 161],          // #0369a1 - SOAP Note
    orange: [194, 65, 12],       // #c2410c - Referral needed
    muted: [100, 116, 139],      // #64748b
    dark: [15, 23, 42],          // #0f172a
    lightBg: [248, 250, 252],    // #f8fafc
    white: [255, 255, 255],
};

/**
 * Safely convert any value to a printable string.
 * Handles objects, arrays, nulls, etc.
 */
function toStr(val) {
    if (val === null || val === undefined) return 'N/A';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (Array.isArray(val)) {
        return val.map(item => {
            if (typeof item === 'string') return item;
            if (typeof item === 'object') return flattenObject(item);
            return String(item);
        }).join(', ');
    }
    if (typeof val === 'object') return flattenObject(val);
    return String(val);
}

/**
 * Flatten a nested object into readable key: value lines.
 */
function flattenObject(obj, prefix = '') {
    if (!obj || typeof obj !== 'object') return toStr(obj);
    const parts = [];
    for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith('_')) continue;
        const label = key.replace(/_/g, ' ');
        if (Array.isArray(value)) {
            parts.push(`${label}: ${value.map(v => typeof v === 'object' ? flattenObject(v) : String(v)).join('; ')}`);
        } else if (typeof value === 'object' && value !== null) {
            parts.push(`${label}: ${flattenObject(value)}`);
        } else {
            parts.push(`${label}: ${value}`);
        }
    }
    return parts.join(' | ');
}

/**
 * Generate and download a PDF of the encounter details.
 * @param {Object} encounter - Encounter data from the API
 * @param {Object} aiResult - AI Assessment Results data
 * @param {Array} vitals - Array of vital sign observations
 * @param {string} patientName - Patient's name
 */
export function generateEncounterPDF(encounter, aiResult, vitals, patientName) {
    try {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        const contentWidth = pageWidth - 2 * margin;
        let y = 15;

        // Helper: check if we need a new page
        const checkPage = (needed = 20) => {
            if (y + needed > pageHeight - 20) {
                doc.addPage();
                y = 15;
            }
        };

        // Helper: format date
        const formatDate = (dateString) => {
            if (!dateString) return 'N/A';
            return new Date(dateString).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        };

        // Helper: draw a bullet point (filled circle) — avoids Unicode rendering issues
        const drawBullet = (x, yPos, radius = 1, color = COLORS.dark) => {
            doc.setFillColor(...color);
            doc.circle(x, yPos - 1, radius, 'F');
        };

        // Helper: render a bullet list with proper ASCII-safe rendering
        const renderBulletList = (items, indent = 4, bulletColor = COLORS.dark) => {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...COLORS.dark);
            items.forEach(item => {
                checkPage(7);
                const text = toStr(item);
                const lines = doc.splitTextToSize(text, contentWidth - indent - 8);
                drawBullet(margin + indent + 1.5, y, 0.8, bulletColor);
                doc.text(lines, margin + indent + 5, y);
                y += lines.length * 4.2 + 2;
            });
        };

        // Helper: render key-value pair
        const renderKeyValue = (label, value, labelColor = COLORS.muted) => {
            checkPage(8);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...labelColor);
            doc.text(`${label}:`, margin + 2, y);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...COLORS.dark);
            const valText = toStr(value);
            const lines = doc.splitTextToSize(valText, contentWidth - 45);
            doc.text(lines, margin + 42, y);
            y += lines.length * 4.2 + 2.5;
        };

        // ============================================================
        // HEADER BAR
        // ============================================================
        doc.setFillColor(...COLORS.teal);
        doc.rect(0, 0, pageWidth, 30, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('JeevanAlert AI - Clinical Encounter Report', margin, 13);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Patient: ${patientName}`, margin, 20);
        doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 26);

        y = 37;
        doc.setTextColor(...COLORS.dark);

        // ============================================================
        // ENCOUNTER INFO
        // ============================================================
        sectionTitle(doc, 'Encounter Details', COLORS.teal, margin, y, contentWidth);
        y += 10;

        renderKeyValue('Date', formatDate(encounter.created_at));
        renderKeyValue('Status', (encounter.status || 'pending').toUpperCase());
        renderKeyValue('Chief Complaint', encounter.chief_complaint || 'N/A');
        renderKeyValue('Symptoms', encounter.symptoms || 'N/A');
        renderKeyValue('Duration', encounter.symptom_duration || 'N/A');

        if (encounter.medical_history) {
            renderKeyValue('Medical History', encounter.medical_history);
        }

        // ============================================================
        // VITAL SIGNS TABLE
        // ============================================================
        if (vitals && vitals.length > 0) {
            y += 4;
            checkPage(25);
            sectionTitle(doc, 'Vital Signs', COLORS.primary, margin, y, contentWidth);
            y += 10;

            const vitalRows = vitals.map(v => [
                v.observation_type || 'Unknown',
                `${v.value || ''}${v.value_secondary ? '/' + v.value_secondary : ''}`,
                v.unit || '-'
            ]);

            doc.autoTable({
                startY: y,
                margin: { left: margin, right: margin },
                head: [['Vital Sign', 'Value', 'Unit']],
                body: vitalRows,
                theme: 'striped',
                headStyles: {
                    fillColor: COLORS.primary,
                    fontSize: 9,
                    font: 'helvetica',
                    fontStyle: 'bold',
                    textColor: [255, 255, 255],
                    cellPadding: 3
                },
                bodyStyles: {
                    fontSize: 9,
                    textColor: COLORS.dark,
                    cellPadding: 2.5
                },
                alternateRowStyles: {
                    fillColor: [241, 245, 249] // #f1f5f9
                },
                styles: {
                    lineColor: [226, 232, 240], // #e2e8f0
                    lineWidth: 0.3
                },
            });
            y = doc.lastAutoTable.finalY + 8;
        }

        // ============================================================
        // AI ASSESSMENT RESULTS
        // ============================================================
        if (!aiResult) {
            checkPage(10);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(...COLORS.muted);
            doc.text('No AI assessment data available.', margin, y);
            y += 8;
        } else {
            // Main AI header bar
            y += 2;
            checkPage(14);
            doc.setFillColor(...COLORS.teal);
            doc.roundedRect(margin, y - 4, contentWidth, 12, 2, 2, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.text('AI Assessment Results', margin + 4, y + 3);
            y += 14;
            doc.setTextColor(...COLORS.dark);

            // ------ 1. Clinical Assessment ------
            checkPage(20);
            sectionTitle(doc, 'Clinical Assessment', COLORS.primary, margin, y, contentWidth);
            y += 10;

            if (aiResult.triage_level) {
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...COLORS.muted);
                doc.text('Triage Level:', margin + 2, y);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...triageColor(aiResult.triage_level));
                doc.setFontSize(10);
                doc.text(String(aiResult.triage_level).toUpperCase(), margin + 35, y);
                y += 7;
            }

            if (aiResult.risk_level) {
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...COLORS.muted);
                doc.text('Risk Level:', margin + 2, y);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...riskColor(aiResult.risk_level));
                doc.setFontSize(10);
                doc.text(String(aiResult.risk_level).toUpperCase(), margin + 35, y);
                y += 7;
            }

            if (aiResult.assessment_summary) {
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...COLORS.muted);
                doc.text('Assessment Summary:', margin + 2, y);
                y += 5;
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...COLORS.dark);
                const summaryText = toStr(aiResult.assessment_summary);
                const lines = doc.splitTextToSize(summaryText, contentWidth - 8);
                lines.forEach(line => {
                    checkPage(5);
                    doc.text(line, margin + 4, y);
                    y += 4.2;
                });
                y += 3;
            }

            if (aiResult.differential_diagnoses?.length > 0) {
                checkPage(10);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...COLORS.muted);
                doc.text('Possible Diagnoses:', margin + 2, y);
                y += 5;
                renderBulletList(aiResult.differential_diagnoses, 4, COLORS.purple);
            }

            if (aiResult.triage_reasoning) {
                checkPage(10);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...COLORS.muted);
                doc.text('Clinical Reasoning:', margin + 2, y);
                y += 5;
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...COLORS.dark);
                const reasonText = toStr(aiResult.triage_reasoning);
                const lines = doc.splitTextToSize(reasonText, contentWidth - 8);
                lines.forEach(line => {
                    checkPage(5);
                    doc.text(line, margin + 4, y);
                    y += 4.2;
                });
                y += 3;
            }

            y += 2;

            // ------ 2. Red Flags ------
            if (aiResult.red_flags?.length > 0) {
                checkPage(15);
                sectionTitle(doc, 'Red Flags - Needs Immediate Attention', COLORS.danger, margin, y, contentWidth);
                y += 10;
                renderBulletList(aiResult.red_flags, 4, COLORS.danger);
                y += 2;
            }

            // ------ 3. Recommended Investigations ------
            if (aiResult.recommended_investigations?.length > 0) {
                checkPage(15);
                sectionTitle(doc, 'Recommended Investigations', COLORS.purple, margin, y, contentWidth);
                y += 10;
                renderBulletList(aiResult.recommended_investigations, 4, COLORS.purple);
                y += 2;
            }

            // ------ 4. Risk Recommendations ------
            if (aiResult.risk_recommendations?.length > 0) {
                checkPage(15);
                sectionTitle(doc, 'Risk-Based Recommendations', COLORS.orange, margin, y, contentWidth);
                y += 10;
                renderBulletList(aiResult.risk_recommendations, 4, COLORS.orange);
                y += 2;
            }

            // ------ 5. Referral Decision ------
            if (aiResult.referral_needed !== undefined) {
                checkPage(15);
                const refColor = aiResult.referral_needed ? COLORS.orange : COLORS.green;
                sectionTitle(doc, 'Referral Decision', refColor, margin, y, contentWidth);
                y += 10;

                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...refColor);
                doc.text(aiResult.referral_needed ? 'REFERRAL NEEDED' : 'No Referral Needed', margin + 2, y);
                y += 6;

                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...COLORS.dark);
                if (aiResult.referral_type && aiResult.referral_type !== 'none') {
                    renderKeyValue('Referral Type', aiResult.referral_type);
                }
                if (aiResult.referral_urgency) {
                    renderKeyValue('Urgency', aiResult.referral_urgency);
                }
                y += 2;
            }

            // ------ 6. Treatment Plan ------
            if (aiResult.medications?.length > 0 || aiResult.care_plan_goals?.length > 0 || aiResult.interventions?.length > 0) {
                checkPage(20);
                sectionTitle(doc, 'Treatment Plan', COLORS.green, margin, y, contentWidth);
                y += 10;

                // Medications table
                if (aiResult.medications?.length > 0) {
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...COLORS.muted);
                    doc.text('Medications:', margin + 2, y);
                    y += 5;

                    const medRows = aiResult.medications.map(med => [
                        typeof med === 'string' ? med : (med.name || toStr(med)),
                        typeof med === 'object' ? (med.dose || '-') : '-',
                        typeof med === 'object' ? (med.frequency || '-') : '-',
                    ]);

                    doc.autoTable({
                        startY: y,
                        margin: { left: margin, right: margin },
                        head: [['Medication', 'Dose', 'Frequency']],
                        body: medRows,
                        theme: 'striped',
                        headStyles: {
                            fillColor: COLORS.green,
                            fontSize: 9,
                            textColor: [255, 255, 255],
                            cellPadding: 3
                        },
                        bodyStyles: { fontSize: 9, cellPadding: 2.5, textColor: COLORS.dark },
                        alternateRowStyles: { fillColor: [240, 253, 244] }, // #f0fdf4
                        styles: { lineColor: [226, 232, 240], lineWidth: 0.3 },
                    });
                    y = doc.lastAutoTable.finalY + 6;
                }

                // Medication Education
                if (aiResult.medication_education) {
                    checkPage(10);
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...COLORS.muted);
                    doc.text('Medication Education:', margin + 2, y);
                    y += 5;
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(...COLORS.dark);
                    const eduText = toStr(aiResult.medication_education);
                    const lines = doc.splitTextToSize(eduText, contentWidth - 8);
                    lines.forEach(line => {
                        checkPage(5);
                        doc.text(line, margin + 4, y);
                        y += 4.2;
                    });
                    y += 3;
                }

                // Care Plan Goals
                if (aiResult.care_plan_goals?.length > 0) {
                    checkPage(10);
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...COLORS.muted);
                    doc.text('Care Plan Goals:', margin + 2, y);
                    y += 5;
                    renderBulletList(
                        aiResult.care_plan_goals.map(g =>
                            typeof g === 'object' ? (g.description || g.goal || toStr(g)) : g
                        ),
                        4, COLORS.green
                    );
                }

                // Interventions
                if (aiResult.interventions?.length > 0) {
                    checkPage(10);
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...COLORS.muted);
                    doc.text('Interventions:', margin + 2, y);
                    y += 5;
                    renderBulletList(aiResult.interventions, 4, COLORS.green);
                }

                y += 2;
            }

            // ------ 7. Patient Education ------
            if (aiResult.patient_education) {
                checkPage(15);
                sectionTitle(doc, 'Patient Education', [14, 165, 233], margin, y, contentWidth); // sky-500
                y += 10;
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...COLORS.dark);
                const eduText = toStr(aiResult.patient_education);
                const lines = doc.splitTextToSize(eduText, contentWidth - 8);
                lines.forEach(line => {
                    checkPage(5);
                    doc.text(line, margin + 4, y);
                    y += 4.2;
                });
                y += 4;
            }

            // ------ 8. SOAP Note ------
            if (aiResult.soap_note) {
                checkPage(20);
                sectionTitle(doc, 'SOAP Note', COLORS.sky, margin, y, contentWidth);
                y += 10;

                const soapData = typeof aiResult.soap_note === 'string'
                    ? tryParseJSON(aiResult.soap_note)
                    : aiResult.soap_note;

                // Handle SOAP_NOTE wrapper
                const note = soapData?.SOAP_NOTE || soapData;

                const soapSections = [
                    { key: 'Subjective', label: 'S - Subjective', color: [59, 130, 246] },
                    { key: 'Objective', label: 'O - Objective', color: [139, 92, 246] },
                    { key: 'Assessment', label: 'A - Assessment', color: [245, 158, 11] },
                    { key: 'Plan', label: 'P - Plan', color: [16, 185, 129] },
                ];

                if (typeof note === 'object' && note !== null) {
                    soapSections.forEach(({ key, label, color }) => {
                        const content = note[key] || note[key.toLowerCase()] || note[key.toUpperCase()];
                        if (!content) return;

                        checkPage(12);
                        // Sub-header for each SOAP section with color bar
                        doc.setFillColor(...color);
                        doc.rect(margin + 2, y - 3, 3, 6, 'F'); // color bar
                        doc.setFontSize(10);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(...color);
                        doc.text(label, margin + 8, y);
                        y += 6;

                        // Render SOAP content inline so y is tracked properly
                        doc.setFontSize(9);
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(...COLORS.dark);
                        const soapText = renderSOAPToText(content, 0);
                        const soapLines = doc.splitTextToSize(soapText, contentWidth - 12);
                        soapLines.forEach(line => {
                            checkPage(5);
                            doc.text(line, margin + 8, y);
                            y += 4.2;
                        });
                        y += 4;
                    });

                    // Handle case where none of the standard SOAP keys matched
                    const hasAny = soapSections.some(({ key }) =>
                        note[key] || note[key.toLowerCase()] || note[key.toUpperCase()]
                    );
                    if (!hasAny) {
                        // Just render all keys
                        doc.setFontSize(9);
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(...COLORS.dark);
                        const noteText = flattenObject(note);
                        const lines = doc.splitTextToSize(noteText, contentWidth - 8);
                        lines.forEach(line => {
                            checkPage(5);
                            doc.text(line, margin + 4, y);
                            y += 4.2;
                        });
                    }
                } else if (typeof note === 'string') {
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(...COLORS.dark);
                    const lines = doc.splitTextToSize(note, contentWidth - 8);
                    lines.forEach(line => {
                        checkPage(5);
                        doc.text(line, margin + 4, y);
                        y += 4.2;
                    });
                }

                y += 4;
            }

            // ------ 9. Emergency Protocol (if any) ------
            if (aiResult.emergency_protocol) {
                checkPage(15);
                sectionTitle(doc, 'Emergency Protocol Activated', COLORS.danger, margin, y, contentWidth);
                y += 10;
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...COLORS.dark);
                const epText = toStr(aiResult.emergency_protocol);
                const lines = doc.splitTextToSize(epText, contentWidth - 8);
                lines.forEach(line => {
                    checkPage(5);
                    doc.text(line, margin + 4, y);
                    y += 4.2;
                });
                y += 4;
            }
        }

        // ============================================================
        // FOOTER on every page
        // ============================================================
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            const footerY = pageHeight - 8;

            // Subtle line above footer
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.3);
            doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);

            doc.setFontSize(7);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(...COLORS.muted);
            doc.text(
                'JeevanAlert AI Clinical Report - AI-generated, for clinical decision support only. Not a substitute for professional medical judgment.',
                margin, footerY
            );
            doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 20, footerY);
        }

        // Download
        const safeName = patientName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const safeDate = formatDate(encounter.created_at).replace(/[,\s:]+/g, '_');
        const fileName = `Encounter_${safeName}_${safeDate}.pdf`;
        doc.save(fileName);
        console.log('PDF generated successfully:', fileName);
        return { success: true, fileName };

    } catch (error) {
        console.error('PDF generation failed:', error);
        alert(`Failed to generate PDF: ${error.message}\n\nPlease try again or contact support if the issue persists.`);
        return { success: false, error: error.message };
    }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Draw a colored section title bar with text
 */
function sectionTitle(doc, title, color, x, y, width) {
    doc.setFillColor(...color);
    doc.roundedRect(x, y - 4, width, 9, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(title, x + 4, y + 2);
}


/**
 * Convert SOAP content to plain text recursively
 */
function renderSOAPToText(content, depth = 0) {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (typeof content === 'number' || typeof content === 'boolean') return String(content);

    if (Array.isArray(content)) {
        return content.map(item => {
            if (typeof item === 'string') return `- ${item}`;
            if (typeof item === 'object') return `- ${flattenObject(item)}`;
            return `- ${item}`;
        }).join('\n');
    }

    if (typeof content === 'object') {
        const parts = [];
        for (const [key, value] of Object.entries(content)) {
            if (key.startsWith('_')) continue;
            const label = key.replace(/_/g, ' ');
            if (typeof value === 'string' || typeof value === 'number') {
                parts.push(`${label}: ${value}`);
            } else if (Array.isArray(value)) {
                parts.push(`${label}:`);
                value.forEach(item => {
                    if (typeof item === 'string') parts.push(`  - ${item}`);
                    else parts.push(`  - ${flattenObject(item)}`);
                });
            } else if (typeof value === 'object' && value !== null) {
                parts.push(`${label}: ${flattenObject(value)}`);
            }
        }
        return parts.join('\n');
    }
    return String(content);
}

/**
 * Try to parse a JSON string, return the original string if parsing fails.
 */
function tryParseJSON(str) {
    if (typeof str !== 'string') return str;
    try {
        return JSON.parse(str);
    } catch {
        return str;
    }
}

function triageColor(level) {
    const l = (level || '').toLowerCase();
    if (l === 'emergency' || l === 'emergent') return [220, 38, 38]; // red
    if (l === 'urgent') return [234, 88, 12];                         // orange
    if (l === 'moderate' || l === 'semi-urgent') return [202, 138, 4]; // amber
    return [22, 163, 74];                                               // green
}

function riskColor(level) {
    const l = (level || '').toLowerCase();
    if (l === 'high' || l === 'high-risk') return [220, 38, 38];
    if (l === 'moderate' || l === 'medium') return [202, 138, 4];
    return [22, 163, 74];
}

export default generateEncounterPDF;
