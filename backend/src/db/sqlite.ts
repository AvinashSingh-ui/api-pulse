import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const BASE_DIR = process.cwd().endsWith('backend') ? process.cwd() : path.join(process.cwd(), 'backend');
const DATA_DIR = path.resolve(BASE_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'apipulse.db');

export class SQLiteService {
  private db: DatabaseSync | null = null;
  public isConnected = false;

  constructor() {
    this.init();
  }

  private init(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      this.db = new DatabaseSync(DB_FILE);
      this.isConnected = true;
      this.migrate();
      console.log(`✅ [SQLite] Connected to Real SQL Database at ${DB_FILE}`);
    } catch (err: any) {
      console.warn('[SQLite] Fallback to in-memory SQLite:', err.message);
      try {
        this.db = new DatabaseSync(':memory:');
        this.isConnected = true;
        this.migrate();
      } catch (e: any) {
        console.error('[SQLite] Could not initialize database:', e.message);
      }
    }
  }

  private migrate(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'developer',
        avatar TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'active',
        base_url TEXT NOT NULL,
        environment TEXT DEFAULT 'production',
        endpoint_count INTEGER DEFAULT 0,
        health_score INTEGER DEFAULT 100,
        user_id TEXT,
        deleted_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS endpoints (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        method TEXT NOT NULL,
        status TEXT DEFAULT 'healthy',
        interval_sec INTEGER DEFAULT 60,
        expected_status INTEGER DEFAULT 200,
        timeout_ms INTEGER DEFAULT 5000,
        p50_ms INTEGER DEFAULT 0,
        p95_ms INTEGER DEFAULT 0,
        p99_ms INTEGER DEFAULT 0,
        uptime REAL DEFAULT 100.0,
        requests_per_min INTEGER DEFAULT 0,
        error_rate REAL DEFAULT 0.0,
        health_score INTEGER DEFAULT 100,
        degradation_reason TEXT,
        last_status_code INTEGER,
        latency_threshold_ms INTEGER DEFAULT 500,
        last_checked TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS request_logs (
        id TEXT PRIMARY KEY,
        endpoint_id TEXT,
        project_id TEXT,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        response_time_ms INTEGER NOT NULL,
        request_size INTEGER DEFAULT 0,
        response_size INTEGER DEFAULT 0,
        ip_address TEXT,
        user_agent TEXT,
        failure_type TEXT DEFAULT 'none',
        error_message TEXT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS alert_rules (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        endpoint_id TEXT,
        name TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        threshold REAL NOT NULL,
        operator TEXT DEFAULT 'gt',
        severity TEXT DEFAULT 'high',
        is_enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        rule_id TEXT,
        project_id TEXT NOT NULL,
        endpoint_id TEXT,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        severity TEXT DEFAULT 'high',
        status TEXT DEFAULT 'active',
        triggered_at TEXT DEFAULT CURRENT_TIMESTAMP,
        acknowledged_at TEXT,
        resolved_at TEXT,
        current_value REAL,
        threshold_value REAL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        endpoint_id TEXT,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        severity TEXT DEFAULT 'warning',
        type TEXT DEFAULT 'degraded',
        is_read INTEGER DEFAULT 0,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_endpoints_project ON endpoints(project_id);
      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON request_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_logs_status ON request_logs(status_code);
      CREATE INDEX IF NOT EXISTS idx_notifications_endpoint ON notifications(endpoint_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
      CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
    `);

    // Safe dynamic migration for existing databases
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          endpoint_id TEXT,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          severity TEXT DEFAULT 'warning',
          type TEXT DEFAULT 'degraded',
          is_read INTEGER DEFAULT 0,
          metadata TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch {}
    try { this.db.exec('ALTER TABLE projects ADD COLUMN user_id TEXT'); } catch {}
    try { this.db.exec('ALTER TABLE projects ADD COLUMN deleted_at TEXT'); } catch {}
    try { this.db.exec('ALTER TABLE endpoints ADD COLUMN health_score INTEGER DEFAULT 100'); } catch {}
    try { this.db.exec('ALTER TABLE endpoints ADD COLUMN degradation_reason TEXT'); } catch {}
    try { this.db.exec('ALTER TABLE endpoints ADD COLUMN last_status_code INTEGER'); } catch {}
    try { this.db.exec('ALTER TABLE endpoints ADD COLUMN latency_threshold_ms INTEGER DEFAULT 500'); } catch {}
  }

  public query<T = any>(sql: string, params: any[] = []): T[] {
    if (!this.db) return [];
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  public execute(sql: string, params: any[] = []): void {
    if (!this.db) return;
    const stmt = this.db.prepare(sql);
    stmt.run(...params);
  }
}

export const sqliteService = new SQLiteService();

