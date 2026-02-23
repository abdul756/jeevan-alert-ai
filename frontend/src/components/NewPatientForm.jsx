import { useState } from 'react';
import './NewPatientForm.css';

const NewPatientForm = ({ onClose, onSave }) => {
    const [formData, setFormData] = useState({
        name: '',
        age: '',
        gender: '',
        chiefComplaint: '',
        symptoms: '',
        duration: '',
        vitals: {
            bpSystolic: '',
            bpDiastolic: '',
            heartRate: '',
            temperature: '',
            bloodSugar: '',
            spo2: ''
        },
        medicalHistory: '',
        medications: '',
        height: '',
        weight: '',
        address: {
            line1: '',
            line2: '',
            city: '',
            state: '',
            zipCode: '',
            country: ''
        },
        countryCode: '+1',
        mobile: '',
        email: ''
    });

    const [errors, setErrors] = useState({});

    const handleChange = (e) => {
        const { name, value } = e.target;

        if (name.startsWith('vitals.')) {
            const vitalName = name.split('.')[1];
            setFormData(prev => ({
                ...prev,
                vitals: {
                    ...prev.vitals,
                    [vitalName]: value
                }
            }));
        } else if (name.startsWith('address.')) {
            const addressField = name.split('.')[1];
            setFormData(prev => ({
                ...prev,
                address: {
                    ...prev.address,
                    [addressField]: value
                }
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                [name]: value
            }));
        }

        // Clear error when user starts typing
        if (errors[name]) {
            setErrors(prev => ({
                ...prev,
                [name]: ''
            }));
        }
    };

    const validateForm = () => {
        const newErrors = {};

        if (!formData.name.trim()) newErrors.name = 'Name is required';
        if (!formData.age) newErrors.age = 'Age is required';
        if (!formData.gender) newErrors.gender = 'Gender is required';
        if (!formData.chiefComplaint.trim()) newErrors.chiefComplaint = 'Chief complaint is required';
        if (!formData.mobile.trim()) newErrors.mobile = 'Mobile number is required';

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        if (validateForm()) {
            onSave(formData);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>New Patient Registration</h2>
                    <button className="close-btn" onClick={onClose} aria-label="Close">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="patient-form">
                    {/* Personal Information */}
                    <div className="form-section">
                        <h3 className="section-title">Personal Information</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="name">Full Name <span className="required">*</span></label>
                                <input
                                    type="text"
                                    id="name"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    className={errors.name ? 'error' : ''}
                                    placeholder="Enter patient's full name"
                                />
                                {errors.name && <span className="error-text">{errors.name}</span>}
                            </div>

                            <div className="form-group">
                                <label htmlFor="age">Age <span className="required">*</span></label>
                                <input
                                    type="number"
                                    id="age"
                                    name="age"
                                    value={formData.age}
                                    onChange={handleChange}
                                    className={errors.age ? 'error' : ''}
                                    placeholder="Age in years"
                                    min="0"
                                    max="150"
                                />
                                {errors.age && <span className="error-text">{errors.age}</span>}
                            </div>

                            <div className="form-group">
                                <label htmlFor="gender">Gender <span className="required">*</span></label>
                                <select
                                    id="gender"
                                    name="gender"
                                    value={formData.gender}
                                    onChange={handleChange}
                                    className={errors.gender ? 'error' : ''}
                                >
                                    <option value="">Select gender</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                                {errors.gender && <span className="error-text">{errors.gender}</span>}
                            </div>
                        </div>
                    </div>

                    {/* Clinical Information */}
                    <div className="form-section">
                        <h3 className="section-title">Clinical Information</h3>
                        <div className="form-row">
                            <div className="form-group full-width">
                                <label htmlFor="chiefComplaint">Chief Complaint <span className="required">*</span></label>
                                <input
                                    type="text"
                                    id="chiefComplaint"
                                    name="chiefComplaint"
                                    value={formData.chiefComplaint}
                                    onChange={handleChange}
                                    className={errors.chiefComplaint ? 'error' : ''}
                                    placeholder="Primary reason for visit"
                                />
                                {errors.chiefComplaint && <span className="error-text">{errors.chiefComplaint}</span>}
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="symptoms">Symptoms</label>
                                <textarea
                                    id="symptoms"
                                    name="symptoms"
                                    value={formData.symptoms}
                                    onChange={handleChange}
                                    placeholder="Describe symptoms"
                                    rows="3"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="duration">Duration</label>
                                <input
                                    type="text"
                                    id="duration"
                                    name="duration"
                                    value={formData.duration}
                                    onChange={handleChange}
                                    placeholder="e.g., 3 days, 2 weeks"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Vitals */}
                    <div className="form-section">
                        <h3 className="section-title">Vital Signs</h3>
                        <div className="form-row vitals-row">
                            <div className="form-group">
                                <label htmlFor="bpSystolic">BP Systolic</label>
                                <input
                                    type="number"
                                    id="bpSystolic"
                                    name="vitals.bpSystolic"
                                    value={formData.vitals.bpSystolic}
                                    onChange={handleChange}
                                    placeholder="mmHg"
                                    min="0"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="bpDiastolic">BP Diastolic</label>
                                <input
                                    type="number"
                                    id="bpDiastolic"
                                    name="vitals.bpDiastolic"
                                    value={formData.vitals.bpDiastolic}
                                    onChange={handleChange}
                                    placeholder="mmHg"
                                    min="0"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="heartRate">Heart Rate</label>
                                <input
                                    type="number"
                                    id="heartRate"
                                    name="vitals.heartRate"
                                    value={formData.vitals.heartRate}
                                    onChange={handleChange}
                                    placeholder="bpm"
                                    min="0"
                                />
                            </div>
                        </div>

                        <div className="form-row vitals-row">
                            <div className="form-group">
                                <label htmlFor="temperature">Temperature</label>
                                <input
                                    type="number"
                                    id="temperature"
                                    name="vitals.temperature"
                                    value={formData.vitals.temperature}
                                    onChange={handleChange}
                                    placeholder="°F"
                                    step="0.1"
                                    min="0"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="bloodSugar">Blood Sugar</label>
                                <input
                                    type="number"
                                    id="bloodSugar"
                                    name="vitals.bloodSugar"
                                    value={formData.vitals.bloodSugar}
                                    onChange={handleChange}
                                    placeholder="mg/dL"
                                    min="0"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="spo2">SPO2</label>
                                <input
                                    type="number"
                                    id="spo2"
                                    name="vitals.spo2"
                                    value={formData.vitals.spo2}
                                    onChange={handleChange}
                                    placeholder="%"
                                    min="0"
                                    max="100"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Medical History */}
                    <div className="form-section">
                        <h3 className="section-title">Medical Background</h3>
                        <div className="form-row">
                            <div className="form-group full-width">
                                <label htmlFor="medicalHistory">Medical History</label>
                                <textarea
                                    id="medicalHistory"
                                    name="medicalHistory"
                                    value={formData.medicalHistory}
                                    onChange={handleChange}
                                    placeholder="Previous conditions, surgeries, allergies, etc."
                                    rows="3"
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group full-width">
                                <label htmlFor="medications">Current Medications</label>
                                <textarea
                                    id="medications"
                                    name="medications"
                                    value={formData.medications}
                                    onChange={handleChange}
                                    placeholder="List current medications"
                                    rows="3"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Physical Measurements */}
                    <div className="form-section">
                        <h3 className="section-title">Physical Measurements</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="height">Height</label>
                                <input
                                    type="number"
                                    id="height"
                                    name="height"
                                    value={formData.height}
                                    onChange={handleChange}
                                    placeholder="cm"
                                    min="0"
                                    step="0.1"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="weight">Weight</label>
                                <input
                                    type="number"
                                    id="weight"
                                    name="weight"
                                    value={formData.weight}
                                    onChange={handleChange}
                                    placeholder="kg"
                                    min="0"
                                    step="0.1"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Contact Information */}
                    <div className="form-section">
                        <h3 className="section-title">Contact Information</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="mobile">Mobile Number <span className="required">*</span></label>
                                <div className="phone-input-group">
                                    <select
                                        id="countryCode"
                                        name="countryCode"
                                        value={formData.countryCode}
                                        onChange={handleChange}
                                        className="country-code-select"
                                    >
                                        <option value="+1">🇺🇸 +1</option>
                                        <option value="+44">🇬🇧 +44</option>
                                        <option value="+91">🇮🇳 +91</option>
                                        <option value="+86">🇨🇳 +86</option>
                                        <option value="+81">🇯🇵 +81</option>
                                        <option value="+49">🇩🇪 +49</option>
                                        <option value="+33">🇫🇷 +33</option>
                                        <option value="+39">🇮🇹 +39</option>
                                        <option value="+61">🇦🇺 +61</option>
                                        <option value="+55">🇧🇷 +55</option>
                                        <option value="+7">🇷🇺 +7</option>
                                        <option value="+82">🇰🇷 +82</option>
                                        <option value="+34">🇪🇸 +34</option>
                                        <option value="+52">🇲🇽 +52</option>
                                        <option value="+27">🇿🇦 +27</option>
                                    </select>
                                    <input
                                        type="tel"
                                        id="mobile"
                                        name="mobile"
                                        value={formData.mobile}
                                        onChange={handleChange}
                                        className={errors.mobile ? 'error phone-number-input' : 'phone-number-input'}
                                        placeholder="Enter mobile number"
                                    />
                                </div>
                                {errors.mobile && <span className="error-text">{errors.mobile}</span>}
                            </div>

                            <div className="form-group">
                                <label htmlFor="email">Email ID</label>
                                <input
                                    type="email"
                                    id="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="email@example.com"
                                />
                            </div>
                        </div>

                        {/* Address Fields */}
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="addressLine1">Address Line 1</label>
                                <input
                                    type="text"
                                    id="addressLine1"
                                    name="address.line1"
                                    value={formData.address.line1}
                                    onChange={handleChange}
                                    placeholder="Street address"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="addressLine2">Address Line 2</label>
                                <input
                                    type="text"
                                    id="addressLine2"
                                    name="address.line2"
                                    value={formData.address.line2}
                                    onChange={handleChange}
                                    placeholder="Apartment, suite, etc."
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="city">City</label>
                                <input
                                    type="text"
                                    id="city"
                                    name="address.city"
                                    value={formData.address.city}
                                    onChange={handleChange}
                                    placeholder="City"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="state">State/Province/Region</label>
                                <select
                                    id="state"
                                    name="address.state"
                                    value={formData.address.state}
                                    onChange={handleChange}
                                >
                                    <option value="">Select state</option>
                                    <optgroup label="United States">
                                        <option value="AL">Alabama</option>
                                        <option value="AK">Alaska</option>
                                        <option value="AZ">Arizona</option>
                                        <option value="AR">Arkansas</option>
                                        <option value="CA">California</option>
                                        <option value="CO">Colorado</option>
                                        <option value="CT">Connecticut</option>
                                        <option value="DE">Delaware</option>
                                        <option value="FL">Florida</option>
                                        <option value="GA">Georgia</option>
                                        <option value="HI">Hawaii</option>
                                        <option value="ID">Idaho</option>
                                        <option value="IL">Illinois</option>
                                        <option value="IN">Indiana</option>
                                        <option value="IA">Iowa</option>
                                        <option value="KS">Kansas</option>
                                        <option value="KY">Kentucky</option>
                                        <option value="LA">Louisiana</option>
                                        <option value="ME">Maine</option>
                                        <option value="MD">Maryland</option>
                                        <option value="MA">Massachusetts</option>
                                        <option value="MI">Michigan</option>
                                        <option value="MN">Minnesota</option>
                                        <option value="MS">Mississippi</option>
                                        <option value="MO">Missouri</option>
                                        <option value="MT">Montana</option>
                                        <option value="NE">Nebraska</option>
                                        <option value="NV">Nevada</option>
                                        <option value="NH">New Hampshire</option>
                                        <option value="NJ">New Jersey</option>
                                        <option value="NM">New Mexico</option>
                                        <option value="NY">New York</option>
                                        <option value="NC">North Carolina</option>
                                        <option value="ND">North Dakota</option>
                                        <option value="OH">Ohio</option>
                                        <option value="OK">Oklahoma</option>
                                        <option value="OR">Oregon</option>
                                        <option value="PA">Pennsylvania</option>
                                        <option value="RI">Rhode Island</option>
                                        <option value="SC">South Carolina</option>
                                        <option value="SD">South Dakota</option>
                                        <option value="TN">Tennessee</option>
                                        <option value="TX">Texas</option>
                                        <option value="UT">Utah</option>
                                        <option value="VT">Vermont</option>
                                        <option value="VA">Virginia</option>
                                        <option value="WA">Washington</option>
                                        <option value="WV">West Virginia</option>
                                        <option value="WI">Wisconsin</option>
                                        <option value="WY">Wyoming</option>
                                    </optgroup>
                                    <optgroup label="India">
                                        <option value="AP">Andhra Pradesh</option>
                                        <option value="AR">Arunachal Pradesh</option>
                                        <option value="AS">Assam</option>
                                        <option value="BR">Bihar</option>
                                        <option value="CG">Chhattisgarh</option>
                                        <option value="GA">Goa</option>
                                        <option value="GJ">Gujarat</option>
                                        <option value="HR">Haryana</option>
                                        <option value="HP">Himachal Pradesh</option>
                                        <option value="JH">Jharkhand</option>
                                        <option value="KA">Karnataka</option>
                                        <option value="KL">Kerala</option>
                                        <option value="MP">Madhya Pradesh</option>
                                        <option value="MH">Maharashtra</option>
                                        <option value="MN">Manipur</option>
                                        <option value="ML">Meghalaya</option>
                                        <option value="MZ">Mizoram</option>
                                        <option value="NL">Nagaland</option>
                                        <option value="OR">Odisha</option>
                                        <option value="PB">Punjab</option>
                                        <option value="RJ">Rajasthan</option>
                                        <option value="SK">Sikkim</option>
                                        <option value="TN">Tamil Nadu</option>
                                        <option value="TG">Telangana</option>
                                        <option value="TR">Tripura</option>
                                        <option value="UP">Uttar Pradesh</option>
                                        <option value="UT">Uttarakhand</option>
                                        <option value="WB">West Bengal</option>
                                    </optgroup>
                                    <optgroup label="Other">
                                        <option value="OTHER">Other</option>
                                    </optgroup>
                                </select>
                            </div>

                            <div className="form-group">
                                <label htmlFor="zipCode">Zip/Postal Code</label>
                                <input
                                    type="text"
                                    id="zipCode"
                                    name="address.zipCode"
                                    value={formData.address.zipCode}
                                    onChange={handleChange}
                                    placeholder="Zip/Postal code"
                                />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="country">Country</label>
                                <select
                                    id="country"
                                    name="address.country"
                                    value={formData.address.country}
                                    onChange={handleChange}
                                >
                                    <option value="">Select country</option>
                                    <option value="US">United States</option>
                                    <option value="CA">Canada</option>
                                    <option value="GB">United Kingdom</option>
                                    <option value="IN">India</option>
                                    <option value="AU">Australia</option>
                                    <option value="DE">Germany</option>
                                    <option value="FR">France</option>
                                    <option value="IT">Italy</option>
                                    <option value="ES">Spain</option>
                                    <option value="MX">Mexico</option>
                                    <option value="BR">Brazil</option>
                                    <option value="CN">China</option>
                                    <option value="JP">Japan</option>
                                    <option value="KR">South Korea</option>
                                    <option value="RU">Russia</option>
                                    <option value="ZA">South Africa</option>
                                    <option value="OTHER">Other</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Form Actions */}
                    <div className="form-actions">
                        <button type="button" className="btn-cancel" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-save">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 2.58579C3.96086 2.21071 4.46957 2 5 2H16L21 7V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M17 21V13H7V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M7 3V7H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Save Patient
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default NewPatientForm;
