'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useTheme } from '@/components/ThemeProvider';

interface NavItem {
  label: string;
  href: string;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Practice', href: '/practice', roles: ['student'] },
  { label: 'Exams', href: '/exam' },
  { label: 'Progress', href: '/progress', roles: ['student'] },
  { label: 'Questions', href: '/admin/questions', roles: ['placement_member', 'placement_head'] },
  { label: 'Manage Exams', href: '/admin/exams', roles: ['placement_member', 'placement_head'] },
  { label: 'Exam Sessions', href: '/admin/exam-sessions', roles: ['placement_member', 'placement_head'] },
  { label: 'Analytics', href: '/admin/analytics', roles: ['placement_member', 'placement_head'] },
  { label: 'Users', href: '/admin/users', roles: ['placement_head'] },
  { label: 'Rules', href: '/admin/rules', roles: ['placement_head'] },
];

export default function Navbar() {
  const { user, isAuthenticated, isLoading, fetchMe, logout } = useAuthStore();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      fetchMe();
    }
  }, [isAuthenticated, isLoading, fetchMe]);

  if (!isAuthenticated) return null;

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.roles) return true;
    return user && item.roles.includes(user.role);
  });

  return (
    <nav className="border-b border-[var(--header-border)] bg-[var(--header-bg)] backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo + nav */}
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-bold tracking-tight text-[var(--text-heading)]">
              🚀 SMART Code
            </Link>

            <div className="hidden md:flex items-center gap-1">
              {visibleItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    pathname.startsWith(item.href)
                      ? 'font-medium text-[var(--accent-strong)] bg-[var(--accent-soft)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* User menu */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-base text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <span className="text-sm text-[var(--text-secondary)]">
              {user?.name}
            </span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--accent-strong)]">
              {user?.role?.replace('_', ' ')}
            </span>
            <button
              onClick={() => {
                logout();
                router.push('/login');
              }}
              className="text-sm text-[var(--text-secondary)] hover:text-red-500 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
