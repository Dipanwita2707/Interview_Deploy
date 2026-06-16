'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

function SsoHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { ssoLogin } = useAuthStore();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setErrorMsg('No token provided. Please launch from the SMART sidebar.');
      return;
    }

    ssoLogin(token)
      .then(() => {
        router.replace('/practice');
      })
      .catch((err: unknown) => {
        setStatus('error');
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Authentication failed. Your SMART session may have expired — please log in again.'
        );
      });
  }, [searchParams, ssoLogin, router]);

  if (status === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 bg-[var(--bg-secondary)]">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="text-5xl">⚠️</div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">SSO Login Failed</h2>
          <p className="text-sm text-[var(--text-secondary)]">{errorMsg}</p>
          <button
            onClick={() => router.replace('/login')}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin" />
        <p className="text-sm text-[var(--text-secondary)] font-medium">Signing you in via SMART…</p>
      </div>
    </main>
  );
}

export default function SsoPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)]">
          <div className="w-12 h-12 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin" />
        </main>
      }
    >
      <SsoHandler />
    </Suspense>
  );
}
