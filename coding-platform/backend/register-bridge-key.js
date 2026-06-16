/**
 * register-bridge-key.js
 * Registers the coding-platform service API key into the aural-oss
 * Supabase `service_api_keys` table using the service-role key via HTTP API.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Dynamically load from interview-platform/.env or aural-oss/.env file
let envPath = path.join(__dirname, '../../interview-platform/.env');
if (!fs.existsSync(envPath)) {
  envPath = path.join(__dirname, '../../aural-oss/.env');
}
let SUPABASE_URL = '';
let SERVICE_ROLE_KEY = '';

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      if (key === 'SUPABASE_URL') {
        SUPABASE_URL = val;
      } else if (key === 'SUPABASE_SERVICE_ROLE_KEY') {
        SERVICE_ROLE_KEY = val;
      }
    }
  }
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Could not load SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY from aural-oss/.env');
  process.exit(1);
}

const KEY_HASH = 'af522450e307589d278b5926a5283788fd384a673535ae72b56644957fa5a64c';
const KEY_NAME = 'coding-platform-bridge';

function makeRequest(path, method, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      }
    };

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(body);
      options.headers['Prefer'] = 'resolution=ignore-duplicates';
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : null);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log('Connecting to aural-oss Supabase via REST API...');
  try {
    const orgs = await makeRequest('/rest/v1/organizations?select=id&limit=1', 'GET');
    const orgId = orgs && orgs.length > 0 ? orgs[0].id : null;
    console.log('Using orgId:', orgId ?? '(none)');

    const body = JSON.stringify({
      name: KEY_NAME,
      key_hash: KEY_HASH,
      orgId: orgId,
      isActive: true,
    });

    await makeRequest('/rest/v1/service_api_keys', 'POST', body);
    console.log('✅ Bridge API key registered successfully!');
  } catch (err) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

main();

