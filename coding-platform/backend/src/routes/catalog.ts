/**
 * Proxies course/company catalog from the SMART backend.
 * GET /api/catalog  →  { courses: [{id, name, code, course_type}], companies: ["Infosys", …] }
 *
 * The coding platform backend calls the SMART internal endpoint server-to-server,
 * passing the shared service key so no user JWT is needed on the SMART side.
 */
import { Router, Response } from 'express';
import { AuthRequest } from '../types';
import { authenticate } from '../middleware/auth';
import { query } from '../database/connection';
import { config } from '../config';
import https from 'https';
import http from 'http';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.shadowUserId;

  // 1. Get the user's organization_id from the shadow users table
  const userResult = await query(
    'SELECT organization_id FROM users WHERE id = $1 LIMIT 1',
    [userId],
  );
  const orgId: string | null = userResult.rows[0]?.organization_id ?? null;

  if (!orgId) {
    // No org linked — return empty lists; the frontend will fall back to free text
    return res.json({ success: true, data: { courses: [], companies: [] } });
  }

  // 2. Call the SMART internal catalog endpoint
  const smartUrl = `${config.smart.apiUrl}/api/internal/catalog?orgId=${encodeURIComponent(orgId)}`;
  const isHttps = smartUrl.startsWith('https');
  const lib = isHttps ? https : http;

  const data = await new Promise<{ courses: unknown[]; companies: string[] }>((resolve, reject) => {
    const urlObj = new URL(smartUrl);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'x-service-key': config.smart.ssoSecret,
        'Content-Type': 'application/json',
      },
    };

    const reqSmrt = lib.request(options, (resp) => {
      let body = '';
      resp.on('data', (chunk) => (body += chunk));
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.success && parsed.data) {
            resolve(parsed.data);
          } else {
            reject(new Error(parsed.error || 'SMART catalog returned error'));
          }
        } catch {
          reject(new Error('Failed to parse SMART catalog response'));
        }
      });
    });

    reqSmrt.on('error', reject);
    reqSmrt.setTimeout(5000, () => {
      reqSmrt.destroy();
      reject(new Error('SMART catalog request timed out'));
    });
    reqSmrt.end();
  });

  res.json({ success: true, data });
});

export default router;
