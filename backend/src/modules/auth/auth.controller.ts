import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/store.js';
import { config } from '../../config/index.js';
import { sqliteService } from '../../db/sqlite.js';
import { postgresService } from '../../db/postgres.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import type { User } from '../../types/index.js';

function sanitizeUser(user: User): Omit<User, 'password'> {
  const { password, ...safe } = user;
  return safe;
}

export const authController = {
  login: async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // 1. Try finding user in memory store
    let user = db.users.find(u => u.email.toLowerCase() === normalizedEmail);

    // 2. If not found in memory, query real SQLite DB table
    if (!user && sqliteService.isConnected) {
      try {
        const rows = sqliteService.query<any>('SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1', [normalizedEmail]);
        if (rows.length > 0) {
          const row = rows[0];
          user = {
            id: row.id,
            name: row.name,
            email: row.email,
            password: row.password_hash,
            avatar: row.avatar,
            role: row.role || 'developer',
            createdAt: row.created_at,
          };
          db.users.push(user);
        }
      } catch (err) {
        console.warn('[Auth] SQLite query warning:', err);
      }
    }

    // 2b. If still not found, query PostgreSQL DB table
    if (!user && postgresService.isConnected) {
      try {
        const pRes = await postgresService.query('SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1', [normalizedEmail]);
        if (pRes.rows.length > 0) {
          const row = pRes.rows[0];
          user = {
            id: row.id,
            name: row.name,
            email: row.email,
            password: row.password_hash,
            avatar: row.avatar,
            role: row.role || 'developer',
            createdAt: row.created_at,
          };
          db.users.push(user);
        }
      } catch (err) {
        console.warn('[Auth] Postgres query warning:', err);
      }
    }

    // 3. If user does NOT exist in database, reject login completely
    if (!user) {
      return res.status(401).json({
        message: 'No account registered with this email. Please click "Sign Up" to create an account.',
        code: 'USER_NOT_REGISTERED',
      });
    }

    // 4. Verify password with bcrypt
    const passwordMatch = user.password ? await bcrypt.compare(password, user.password) : false;
    if (!passwordMatch) {
      return res.status(401).json({
        message: 'Incorrect password. Please verify your password or sign up if new.',
        code: 'INVALID_CREDENTIALS',
      });
    }

    // 5. Generate signed JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    return res.json({
      user: sanitizeUser(user),
      token,
      message: 'Logged in successfully',
    });
  },

  register: async (req: Request, res: Response) => {
    const { name, email, password, role = 'developer' } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Check if user already registered in memory or SQLite DB or PostgreSQL
    let existing = db.users.find(u => u.email.toLowerCase() === normalizedEmail);
    if (!existing && sqliteService.isConnected) {
      try {
        const rows = sqliteService.query<any>('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [normalizedEmail]);
        if (rows.length > 0) existing = { id: rows[0].id } as any;
      } catch {}
    }
    if (!existing && postgresService.isConnected) {
      try {
        const pRes = await postgresService.query('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [normalizedEmail]);
        if (pRes.rows.length > 0) existing = { id: pRes.rows[0].id } as any;
      } catch {}
    }

    if (existing) {
      return res.status(409).json({
        message: 'An account with this email already exists. Please sign in.',
        code: 'USER_ALREADY_EXISTS',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser: User = {
      id: `usr_${uuidv4().slice(0, 8)}`,
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name.trim())}`,
      role,
      createdAt: new Date().toISOString(),
    };

    // 1. Save entry to Real SQLite Database table
    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'INSERT OR REPLACE INTO users (id, name, email, password_hash, role, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [newUser.id, newUser.name, newUser.email, newUser.password, newUser.role, newUser.avatar, newUser.createdAt]
        );
        console.log(`💾 [DB] User "${newUser.email}" permanently saved to Real SQL Database table "users".`);
      } catch (err: any) {
        console.warn('[DB] SQLite insert warning:', err.message);
      }
    }

    // 2. Save entry to PostgreSQL if connected
    if (postgresService.isConnected) {
      try {
        await postgresService.query(
          'INSERT INTO users (id, name, email, password_hash, role, avatar, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (email) DO UPDATE SET password_hash = $4, name = $2',
          [newUser.id, newUser.name, newUser.email, newUser.password, newUser.role, newUser.avatar, newUser.createdAt]
        );
        console.log(`🐘 [Postgres] User "${newUser.email}" saved to PostgreSQL "users" table.`);
      } catch (err: any) {
        console.warn('[Postgres] Insert error:', err.message);
      }
    }

    // 3. Save entry to in-memory store
    db.users.push(newUser);
    db.save();

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      user: sanitizeUser(newUser),
      token,
      message: 'Account created successfully! You can now log in.',
    });
  },

  me: (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    return res.json(sanitizeUser(req.user));
  },

  logout: (_req: Request, res: Response) => {
    return res.json({ message: 'Logged out successfully' });
  },

  refresh: (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const token = jwt.sign(
      { id: req.user.id, email: req.user.email, role: req.user.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );
    return res.json({ token });
  },
};
