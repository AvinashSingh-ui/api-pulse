import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';
import pkg from 'pg';
const { Pool } = pkg;

const emptyData = {
  users: [],
  projects: [],
  endpoints: [],
  logs: [],
  alertRules: [],
  alerts: [],
  aiInsights: [],
  testCases: []
};

fs.writeFileSync('backend/data/database.json', JSON.stringify(emptyData, null, 2));

try {
  const db = new DatabaseSync('backend/data/apipulse.db');
  db.exec('DELETE FROM request_logs;');
  db.exec('DELETE FROM alerts;');
  db.exec('DELETE FROM alert_rules;');
  db.exec('DELETE FROM endpoints;');
  db.exec('DELETE FROM projects;');
  db.exec('DELETE FROM users;');
  db.close();
  console.log('✅ CLEANED: database.json and apipulse.db are now completely clean!');
} catch (e) {
  console.error('Error wiping SQLite:', e.message);
}

try {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'apipulse',
    password: 'pulse_secret_2024',
    database: 'apipulse_db',
    connectionTimeoutMillis: 1500,
  });
  const client = await pool.connect();
  await client.query('TRUNCATE TABLE request_logs, alerts, alert_rules, endpoints, projects, users CASCADE;');
  client.release();
  await pool.end();
  console.log('✅ CLEANED: PostgreSQL tables completely truncated!');
} catch (e) {
  console.log('ℹ️ Postgres truncation skipped:', e.message);
}
