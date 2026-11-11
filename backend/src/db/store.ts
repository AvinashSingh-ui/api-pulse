import fs from 'fs';
import path from 'path';
import type {
  User, Project, Endpoint, Alert, AlertRule, RequestLog,
  TestCase, TestResult, AIInsight,
} from '../types/index.js';

interface DatabaseSchema {
  users: User[];
  projects: Project[];
  endpoints: Endpoint[];
  alerts: Alert[];
  alertRules: AlertRule[];
  logs: RequestLog[];
  testCases: TestCase[];
  testResults: TestResult[];
  aiInsights: AIInsight[];
}

const BASE_DIR = process.cwd().endsWith('backend') ? process.cwd() : path.join(process.cwd(), 'backend');
const DATA_DIR = path.resolve(BASE_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'database.json');

class DatabaseStore {
  private data: DatabaseSchema;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.data = this.loadData();
  }

  private loadData(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            users: Array.isArray(parsed.users) ? parsed.users : [],
            projects: Array.isArray(parsed.projects) ? parsed.projects : [],
            endpoints: Array.isArray(parsed.endpoints) ? parsed.endpoints : [],
            alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
            alertRules: Array.isArray(parsed.alertRules) ? parsed.alertRules : [],
            logs: Array.isArray(parsed.logs) ? parsed.logs : [],
            testCases: Array.isArray(parsed.testCases) ? parsed.testCases : [],
            testResults: Array.isArray(parsed.testResults) ? parsed.testResults : [],
            aiInsights: Array.isArray(parsed.aiInsights) ? parsed.aiInsights : [],
          };
        }
      }
    } catch (err) {
      console.warn('[DB] Could not load database.json, starting with fresh empty store', err);
    }

    const cleanInitial: DatabaseSchema = {
      users: [],
      projects: [],
      endpoints: [],
      alerts: [],
      alertRules: [],
      logs: [],
      testCases: [],
      testResults: [],
      aiInsights: [],
    };

    this.persistSync(cleanInitial);
    return cleanInitial;
  }

  private persistSync(schema: DatabaseSchema): void {
    try {
      try {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
      } catch {}
      fs.writeFileSync(DATA_FILE, JSON.stringify(schema, null, 2), 'utf-8');
    } catch {
      // In-memory fallback mode active
    }
  }

  public save(): void {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.persistSync(this.data);
      this.saveTimeout = null;
    }, 300);
  }

  // Collections accessors
  public get users() { return this.data.users; }
  public get projects() { return this.data.projects; }
  public get endpoints() { return this.data.endpoints; }
  public get alerts() { return this.data.alerts; }
  public get alertRules() { return this.data.alertRules; }
  public get logs() { return this.data.logs; }
  public get testCases() { return this.data.testCases; }
  public get testResults() { return this.data.testResults; }
  public get aiInsights() { return this.data.aiInsights; }
}

export const db = new DatabaseStore();
