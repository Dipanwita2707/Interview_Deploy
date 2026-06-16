'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

const DEV_MODE = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_DEV_LOGIN === 'true';

export default function LoginPage() {
  const [tab, setTab] = useState<'dev' | 'sso'>(DEV_MODE ? 'dev' : 'sso');
  const [smartToken, setSmartToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);  // local, not from store — avoids hydration mismatch
  const { ssoLogin, devLogin } = useAuthStore();
  const router = useRouter();

  const handleSsoLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await ssoLogin(smartToken);
      router.push('/practice');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'SSO authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await devLogin(email, password);
      router.push('/practice');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4 bg-[var(--bg-secondary)]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🚀</div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">SMART Coding Platform</h1>
          <p className="text-[var(--text-secondary)] mt-2 text-sm">Placement exam &amp; practice system</p>
        </div>

        <div className="bg-[var(--bg-primary)] rounded-2xl border border-[var(--border)] shadow-lg p-6">
          {/* Tabs */}
          {DEV_MODE && (
            <div className="flex rounded-lg bg-[var(--bg-secondary)] p-1 mb-6">
              <button
                onClick={() => setTab('dev')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  tab === 'dev'
                    ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                🛠️ Dev Login
              </button>
              <button
                onClick={() => setTab('sso')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  tab === 'sso'
                    ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                🔑 SMART SSO
              </button>
            </div>
          )}

          {tab === 'dev' && DEV_MODE && (
            <form onSubmit={handleDevLogin} className="space-y-4">
              <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠️ Development mode — login with a seeded account
              </div>
              <div className="text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 space-y-0.5">
                <p className="font-medium text-[var(--text-primary)] mb-1">Available accounts:</p>
                <p>📧 <code>admin@platform.local</code> / <code>Admin@123</code> — Placement Head</p>
                <p>📧 <code>staff@platform.local</code> / <code>Staff@123</code> — Placement Member</p>
                <p>📧 <code>student@platform.local</code> / <code>Student@123</code> — Student</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="e.g. student@platform.local"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Password</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="e.g. Student@123"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>
              )}
              <button
                type="submit" disabled={submitting}
                className="w-full py-2.5 rounded-lg bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          )}

          {/* SSO Login Form */}
          {tab === 'sso' && (
            <form onSubmit={handleSsoLogin} className="space-y-4">
              <div>
                <label htmlFor="token" className="block text-sm font-medium mb-1">SMART SSO Token</label>
                <input
                  id="token" type="password" value={smartToken}
                  onChange={(e) => setSmartToken(e.target.value)}
                  placeholder="Paste your SMART token here"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Get your token from SMART main app → Profile → API Token
                </p>
              </div>
              {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>
              )}
              <button
                type="submit" disabled={submitting || !smartToken}
                className="w-full py-2.5 rounded-lg bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Authenticating…' : 'Sign In with SMART SSO'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
