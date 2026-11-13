import React, { Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Spin } from 'antd';
import { useAppSelector } from '@/app/hooks';
import AppLayout from '@/components/layout/AppLayout';

// Lazy page imports
const LoginPage      = React.lazy(() => import('@/features/auth/LoginPage'));
const DashboardPage  = React.lazy(() => import('@/features/dashboard/DashboardPage'));
const ProjectsPage   = React.lazy(() => import('@/features/projects/ProjectsPage'));
const ProjectDetail  = React.lazy(() => import('@/features/projects/ProjectDetailPage'));
const EndpointsPage  = React.lazy(() => import('@/features/endpoints/EndpointsPage'));
const EndpointDetail = React.lazy(() => import('@/features/endpoints/EndpointDetailPage'));
const MonitoringPage = React.lazy(() => import('@/features/monitoring/MonitoringPage'));
const TestingPage    = React.lazy(() => import('@/features/testing/TestingPage'));
const LogsPage       = React.lazy(() => import('@/features/logs/LogsPage'));
const AlertsPage     = React.lazy(() => import('@/features/alerts/AlertsPage'));
const AIAnalysisPage = React.lazy(() => import('@/features/ai-analysis/AIAnalysisPage'));
const SettingsPage   = React.lazy(() => import('@/features/settings/SettingsPage'));

// ─── Page loader fallback ────────────────────────────────────────────────────
const PageLoader = () => (
  <div
    style={{
      display:        'flex',
      justifyContent: 'center',
      alignItems:     'center',
      minHeight:      '60vh',
    }}
  >
    <Spin size="large" />
  </div>
);

// ─── Route guards ────────────────────────────────────────────────────────────

/** Renders children only when authenticated; otherwise redirects to /login */
function ProtectedRoute() {
  const isAuthenticated = useAppSelector(s => s.auth.isAuthenticated);
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

/** Renders children only when NOT authenticated; otherwise redirects to / */
function PublicRoute() {
  const isAuthenticated = useAppSelector(s => s.auth.isAuthenticated);
  return isAuthenticated ? <Navigate to="/" replace /> : <Outlet />;
}

// ─── Router ──────────────────────────────────────────────────────────────────
export default function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* ── Public routes ── */}
        <Route element={<PublicRoute />}>
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<LoginPage />} />
        </Route>

        {/* ── Protected routes (wrapped in AppLayout) ── */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/"               element={<DashboardPage />} />
            <Route path="/projects"       element={<ProjectsPage />} />
            <Route path="/projects/:id"   element={<ProjectDetail />} />
            <Route path="/endpoints"      element={<EndpointsPage />} />
            <Route path="/endpoints/:id"  element={<EndpointDetail />} />
            <Route path="/monitoring"     element={<MonitoringPage />} />
            <Route path="/testing"        element={<TestingPage />} />
            <Route path="/logs"           element={<LogsPage />} />
            <Route path="/alerts"         element={<AlertsPage />} />
            <Route path="/ai-analysis"    element={<AIAnalysisPage />} />
            <Route path="/settings"       element={<SettingsPage />} />
          </Route>
        </Route>

        {/* ── Fallback ── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
