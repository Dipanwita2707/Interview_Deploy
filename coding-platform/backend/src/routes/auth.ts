import { Router, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../types';
import { verifySsoToken, upsertShadowUser, issueSessionToken, getShadowUserById } from '../services/auth-service';
import { authenticate } from '../middleware/auth';
import { ssoLimiter } from '../middleware/rate-limiter';
import { validate } from '../middleware/validators';
import { query as dbQuery } from '../database/connection';

const router = Router();

// ─── SSO Exchange ──────────────────────────────────────────────
const ssoExchangeSchema = z.object({
  token: z.string().min(1, 'SSO token is required'),
});

router.post('/sso/exchange', ssoLimiter, validate(ssoExchangeSchema), async (req, res: Response) => {
  try {
    const { token } = req.body;

    // Verify the SMART SSO token
    const ssoPayload = verifySsoToken(token);

    // Create or update shadow user
    const shadowUser = await upsertShadowUser(ssoPayload);

    // Issue coding platform session token
    const sessionToken = issueSessionToken(shadowUser);

    res.json({
      success: true,
      data: {
        token: sessionToken,
        user: {
          id: shadowUser.id,
          email: shadowUser.email,
          name: shadowUser.name,
          role: shadowUser.role,
        },
      },
    });
  } catch (err) {
    throw err;
  }
});

// ─── Dev Login (NODE_ENV=development only) ───────────────────
// POST /api/auth/dev-login  { email, password }
router.post('/dev-login', async (req, res: Response) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ success: false, error: 'Not available in production' });
  }

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  // Look up the user by email — only pre-seeded users can log in
  const result = await dbQuery(
    'SELECT * FROM users WHERE email = $1 AND is_active = true LIMIT 1',
    [email]
  );
  const u = result.rows[0];

  if (!u) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }

  if (!u.password_hash) {
    return res.status(401).json({ success: false, error: 'No password set for this account. Contact admin.' });
  }

  const valid = await bcrypt.compare(password, u.password_hash);
  if (!valid) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }

  const token = issueSessionToken({
    id: u.id, smartUserId: u.smart_user_id, email: u.email,
    name: u.name, role: u.role,
    organizationId: u.organization_id, programId: u.program_id,
    dreamCompany: u.dream_company, targetRole: u.target_role,
    packageSlab: u.package_slab, isActive: u.is_active,
    createdAt: u.created_at, updatedAt: u.updated_at,
  });

  return res.json({ success: true, data: { token, user: { id: u.id, email: u.email, name: u.name, role: u.role } } });
});

// ─── Get Current User ──────────────────────────────────────────
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await getShadowUserById(req.user!.shadowUserId);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  res.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      programId: user.programId,
      dreamCompany: user.dreamCompany,
      targetRole: user.targetRole,
      packageSlab: user.packageSlab,
    },
  });
});

export default router;
