'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import Navbar from '@/components/layout/Navbar';

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-primary-500" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-[var(--text-secondary)]">Loading…</p>
      </div>
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, fetchMe } = useAuthStore();
  const router = useRouter();
  // Prevent hydration mismatch: always render a spinner on the very first paint
  // (server and client agree), then let auth state take over after mount.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    if (mounted && !isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [mounted, isLoading, isAuthenticated, router]);

  // Before hydration completes, or while verifying the token, show spinner
  if (!mounted || isLoading) return <Spinner />;

  if (!isAuthenticated) return null;

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </>
  );
}
