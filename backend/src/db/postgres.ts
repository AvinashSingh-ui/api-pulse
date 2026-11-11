import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PostgresService {
  private pool: pkg.Pool | null = null;
  public isConnected = false;

  constructor() {
    this.initPool();
  }

  private initPool(): void {
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/apipulse';

    try {
      this.pool = new Pool({
        connectionString,
        connectionTimeoutMillis: 3000,
        idleTimeoutMillis: 30000,
        max: 20, // 20 concurrent pool connections
      });

      this.pool.on('error', (err) => {
        console.warn('[Postgres] Unexpected error on idle client:', err.message);
      });
    } catch (err: any) {
      console.warn('[Postgres] Could not create connection pool:', err.message);
    }
  }

  public async connectAndMigrate(): Promise<boolean> {
    if (!this.pool) return false;

    try {
      const client = await this.pool.connect();
      console.log('✅ [Postgres] Successfully connected to PostgreSQL production database!');
      this.isConnected = true;

      // Run schema migrations if schema.sql exists
      const schemaPath = path.resolve(__dirname, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const sql = fs.readFileSync(schemaPath, 'utf-8');
        await client.query(sql);
        console.log('📦 [Postgres] Database schema and indexes verified / migrated.');
      }

      client.release();
      return true;
    } catch (err: any) {
      this.isConnected = false;
      console.log(`ℹ️ [Postgres] PostgreSQL not detected on localhost:5432 (${err.message}). Using high-performance in-memory persistence layer.`);
      console.log(`💡 [Postgres] Run "docker compose up -d" in the backend directory to spin up PostgreSQL + pgAdmin.`);
      return false;
    }
  }

  public async query(text: string, params?: any[]): Promise<pkg.QueryResult<any>> {
    if (!this.pool || !this.isConnected) {
      throw new Error('PostgreSQL is not connected');
    }
    return this.pool.query(text, params);
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
    }
  }
}

export const postgresService = new PostgresService();

