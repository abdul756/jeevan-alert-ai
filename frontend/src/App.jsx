import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DarkModeProvider } from './context/DarkModeContext';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import Patients from './components/Patients';
import PatientDetails from './components/PatientDetails';

import SkinScan from './components/SkinScan';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import MwanzoChat from './components/MwanzoChat';
import './index.css';

function App() {
  return (
    <DarkModeProvider>
      <BrowserRouter>
        <div className="App">
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/patients" element={<Patients />} />
            <Route path="/patients/:patientId" element={<PatientDetails />} />

            <Route path="/charma-scan" element={<SkinScan />} />
            <Route path="/analytics" element={<AnalyticsDashboard />} />
            {/* Redirect old routes */}
            <Route path="/ai-workflow" element={<Navigate to="/dashboard" replace />} />
            <Route path="/clinical-intelligence" element={<Navigate to="/dashboard" replace />} />
            <Route path="/multimodal" element={<Navigate to="/charma-scan" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <MwanzoChat />
        </div>
      </BrowserRouter>
    </DarkModeProvider>
  );
}

export default App;
