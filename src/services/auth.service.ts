import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'aiif-super-secure-jwt-secret-key-2026';

export interface UserSession {
  userId: string;
  userCode: string;
  email: string;
  fullName: string;
  roleCode: string;
}

export class AuthService {
  constructor(private db: DatabaseSync) {}

  public login(email: string, plainPassword: string): { token: string; user: UserSession } {
    const row = this.db.prepare(`
      SELECT * FROM user_accounts 
      WHERE email = ? AND deleted_at IS NULL AND is_active = 1
    `).get(email.trim().toLowerCase()) as any;

    if (!row) {
      throw new Error('Invalid email or password');
    }

    const match = bcrypt.compareSync(plainPassword, row.password_hash);
    if (!match) {
      throw new Error('Invalid email or password');
    }

    // Update last login
    this.db.prepare(`
      UPDATE user_accounts SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(row.id);

    const session: UserSession = {
      userId: row.id,
      userCode: row.user_code,
      email: row.email,
      fullName: row.full_name,
      roleCode: row.role_code
    };

    const token = jwt.sign(session, JWT_SECRET, { expiresIn: '24h' });

    return { token, user: session };
  }

  public verifyToken(token: string): UserSession {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as UserSession;
      return decoded;
    } catch {
      throw new Error('Invalid or expired authentication token');
    }
  }

  public getUserById(userId: string): any {
    return this.db.prepare(`
      SELECT id, user_code, email, full_name, phone, role_code, is_active, last_login_at, created_at
      FROM user_accounts
      WHERE id = ? AND deleted_at IS NULL
    `).get(userId);
  }
}
