-- ==========================================================
-- API Pulse - Production PostgreSQL Database Schema
-- ==========================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) DEFAULT 'developer',
  avatar TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Projects Table
CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  status VARCHAR(32) DEFAULT 'active',
  base_url TEXT NOT NULL,
  environment VARCHAR(32) DEFAULT 'production',
  endpoint_count INT DEFAULT 0,
  health_score INT DEFAULT 100,
  tags TEXT[] DEFAULT '{}',
  user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Endpoints Table
CREATE TABLE IF NOT EXISTS endpoints (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  path TEXT NOT NULL,
  method VARCHAR(16) NOT NULL,
  status VARCHAR(32) DEFAULT 'healthy',
  interval_sec INT DEFAULT 60,
  expected_status INT DEFAULT 200,
  timeout_ms INT DEFAULT 5000,
  headers JSONB DEFAULT '{}'::jsonb,
  body TEXT,
  capture_bodies BOOLEAN DEFAULT FALSE,
  p50_ms INT DEFAULT 0,
  p95_ms INT DEFAULT 0,
  p99_ms INT DEFAULT 0,
  uptime NUMERIC(5,2) DEFAULT 100.0,
  requests_per_min INT DEFAULT 0,
  error_rate NUMERIC(5,2) DEFAULT 0.0,
  last_checked TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  tags TEXT[] DEFAULT '{}',
  assertions JSONB DEFAULT '[]'::jsonb
);

-- 4. Request Logs Table (High-volume Telemetry)
CREATE TABLE IF NOT EXISTS request_logs (
  id VARCHAR(64) PRIMARY KEY,
  endpoint_id VARCHAR(64) REFERENCES endpoints(id) ON DELETE CASCADE,
  project_id VARCHAR(64) REFERENCES projects(id) ON DELETE CASCADE,
  method VARCHAR(16) NOT NULL,
  path TEXT NOT NULL,
  status_code INT NOT NULL,
  response_time_ms INT NOT NULL,
  request_size INT DEFAULT 0,
  response_size INT DEFAULT 0,
  ip_address VARCHAR(64),
  user_agent TEXT,
  failure_type VARCHAR(64) DEFAULT 'none',
  error_message TEXT,
  request_headers JSONB,
  response_headers JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Alert Rules Table
CREATE TABLE IF NOT EXISTS alert_rules (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  endpoint_id VARCHAR(64) REFERENCES endpoints(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  trigger_type VARCHAR(64) NOT NULL,
  threshold NUMERIC(10,2) NOT NULL,
  operator VARCHAR(16) DEFAULT 'gt',
  severity VARCHAR(32) DEFAULT 'high',
  is_enabled BOOLEAN DEFAULT TRUE,
  channels TEXT[] DEFAULT '{"email"}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Alerts Incidents Table
CREATE TABLE IF NOT EXISTS alerts (
  id VARCHAR(64) PRIMARY KEY,
  rule_id VARCHAR(64) REFERENCES alert_rules(id) ON DELETE SET NULL,
  project_id VARCHAR(64) REFERENCES projects(id) ON DELETE CASCADE,
  endpoint_id VARCHAR(64) REFERENCES endpoints(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR(32) DEFAULT 'high',
  status VARCHAR(32) DEFAULT 'active',
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  current_value NUMERIC(10,2),
  threshold_value NUMERIC(10,2)
);

-- 7. AI Insights Table
CREATE TABLE IF NOT EXISTS ai_insights (
  id VARCHAR(64) PRIMARY KEY,
  project_id VARCHAR(64) REFERENCES projects(id) ON DELETE CASCADE,
  endpoint_id VARCHAR(64) REFERENCES endpoints(id) ON DELETE CASCADE,
  insight_type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR(32) DEFAULT 'info',
  confidence NUMERIC(4,2) DEFAULT 0.90,
  metadata JSONB DEFAULT '{}'::jsonb,
  likely_causes JSONB DEFAULT '[]'::jsonb,
  suggested_checks JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Optimized Performance Indexes
CREATE INDEX IF NOT EXISTS idx_endpoints_project ON endpoints(project_id);
CREATE INDEX IF NOT EXISTS idx_logs_endpoint ON request_logs(endpoint_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_status ON request_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_alerts_project_status ON alerts(project_id, status);
CREATE INDEX IF NOT EXISTS idx_alert_rules_project ON alert_rules(project_id);

