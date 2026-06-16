import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          🚀 SMART Coding Platform
        </h1>
        <p className="text-lg text-[var(--text-secondary)] mb-8">
          Practice coding problems, take proctored exams, and track your placement readiness.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Link
            href="/practice"
            className="p-6 rounded-xl border border-[var(--border)] hover:border-primary-500 hover:bg-primary-50 transition-colors"
          >
            <h2 className="text-xl font-semibold mb-2">💻 Practice</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Solve coding problems at your own pace
            </p>
          </Link>

          <Link
            href="/exam"
            className="p-6 rounded-xl border border-[var(--border)] hover:border-primary-500 hover:bg-primary-50 transition-colors"
          >
            <h2 className="text-xl font-semibold mb-2">📝 Exams</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Take proctored coding assessments
            </p>
          </Link>

          <Link
            href="/progress"
            className="p-6 rounded-xl border border-[var(--border)] hover:border-primary-500 hover:bg-primary-50 transition-colors"
          >
            <h2 className="text-xl font-semibold mb-2">📊 Progress</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Track your coding journey
            </p>
          </Link>
        </div>

        <p className="text-xs text-[var(--text-secondary)]">
          Integrated with SMART Career Guidance &amp; Placement Management System
        </p>
      </div>
    </main>
  );
}
