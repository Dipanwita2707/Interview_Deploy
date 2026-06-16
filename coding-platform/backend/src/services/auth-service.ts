import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { query } from '../database/connection';
import { SmartSsoPayload, CodingJwtPayload, CodingRole, ShadowUser } from '../types';
import { AppError } from '../utils/app-error';

// Map SMART user level to coding platform role
function mapSmartLevelToRole(userLevel: number): CodingRole {
  switch (userLevel) {
    case 1: // Super Admin
    case 2: // Admin
    case 3: // Coordinator
    case 4: // Mentor
      return CodingRole.PLACEMENT_HEAD; // Staff roles → Head (can be refined)
    case 5: // Student
      return CodingRole.STUDENT;
    default:
      return CodingRole.STUDENT;
  }
}

// Verify SMART SSO token
export function verifySsoToken(token: string): SmartSsoPayload {
  try {
    const decoded = jwt.verify(token, config.smart.ssoSecret) as SmartSsoPayload;
    return decoded;
  } catch (err) {
    throw AppError.unauthorized('Invalid or expired SSO token');
  }
}

// Create or update shadow user from SMART SSO payload
export async function upsertShadowUser(payload: SmartSsoPayload): Promise<ShadowUser> {
  const role = mapSmartLevelToRole(payload.userLevel);
  // name may be absent from older tokens — fall back to email prefix
  const displayName = payload.name || payload.email.split('@')[0];

  const result = await query(
    `INSERT INTO users (id, smart_user_id, email, name, role, organization_id, program_id, dream_company, target_role, package_slab, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW(), NOW())
     ON CONFLICT (smart_user_id) DO UPDATE SET
       email = EXCLUDED.email,
       name = EXCLUDED.name,
       role = EXCLUDED.role,
       organization_id = EXCLUDED.organization_id,
       program_id = EXCLUDED.program_id,
       dream_company = EXCLUDED.dream_company,
       target_role = EXCLUDED.target_role,
       package_slab = EXCLUDED.package_slab,
       updated_at = NOW()
     RETURNING *`,
    [
      uuidv4(),
      payload.userId,
      payload.email,
      displayName,
      role,
      payload.organizationId || null,
      payload.programId || null,
      payload.dreamCompany || null,
      payload.targetRole || null,
      payload.packageSlab || null,
    ]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    smartUserId: row.smart_user_id,
    email: row.email,
    name: row.name,
    role: row.role,
    organizationId: row.organization_id,
    programId: row.program_id,
    dreamCompany: row.dream_company,
    targetRole: row.target_role,
    packageSlab: row.package_slab,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Issue a coding platform session JWT
export function issueSessionToken(user: ShadowUser): string {
  const payload: CodingJwtPayload = {
    userId: user.smartUserId,
    shadowUserId: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  };

  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as string | number,
  } as jwt.SignOptions);
}

// Get shadow user by ID
export async function getShadowUserById(id: string): Promise<ShadowUser | null> {
  const result = await query('SELECT * FROM users WHERE id = $1 AND is_active = true', [id]);
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    smartUserId: row.smart_user_id,
    email: row.email,
    name: row.name,
    role: row.role,
    organizationId: row.organization_id,
    programId: row.program_id,
    dreamCompany: row.dream_company,
    targetRole: row.target_role,
    packageSlab: row.package_slab,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
