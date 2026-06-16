'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminUserApi } from '@/lib/api';
import type { StaffUser } from '@/types';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  // Course assignment form
  const [courseForm, setCourseForm] = useState({ userId: '', courseId: '', courseName: '' });
  const [companyForm, setCompanyForm] = useState({ userId: '', companyName: '' });
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const res = await adminUserApi.listStaff();
      setUsers((res.data.data as StaffUser[]) || []);
    } catch (err) {
      console.error('Failed to load staff:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleAssignCourse = async () => {
    if (!courseForm.userId || !courseForm.courseId || !courseForm.courseName) return;
    setSaving(true);
    try {
      await adminUserApi.assignCourse(courseForm.userId, courseForm.courseId, courseForm.courseName);
      setShowCourseModal(false);
      setCourseForm({ userId: '', courseId: '', courseName: '' });
      loadUsers();
    } catch (err) {
      console.error('Failed to assign course:', err);
      alert('Failed to assign course');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignCompany = async () => {
    if (!companyForm.userId || !companyForm.companyName) return;
    setSaving(true);
    try {
      await adminUserApi.assignCompany(companyForm.userId, companyForm.companyName);
      setShowCompanyModal(false);
      setCompanyForm({ userId: '', companyName: '' });
      loadUsers();
    } catch (err) {
      console.error('Failed to assign company:', err);
      alert('Failed to assign company');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCourseAssignment = async (assignmentId: string) => {
    if (!confirm('Remove this course assignment?')) return;
    try {
      await adminUserApi.removeCourseAssignment(assignmentId);
      loadUsers();
    } catch (err) {
      console.error('Failed to remove:', err);
    }
  };

  const handleRemoveCompanyAssignment = async (assignmentId: string) => {
    if (!confirm('Remove this company assignment?')) return;
    try {
      await adminUserApi.removeCompanyAssignment(assignmentId);
      loadUsers();
    } catch (err) {
      console.error('Failed to remove:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <svg className="mr-3 h-8 w-8 animate-spin text-[var(--accent)]" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-lg text-[var(--text-secondary)]">Loading staff…</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">👥 User Management</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Assign courses and companies to staff members for question management
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCourseModal(true)}
            className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-strong)] transition-colors"
          >
            + Assign Course
          </button>
          <button
            onClick={() => setShowCompanyModal(true)}
            className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            + Assign Company
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <p className="text-2xl font-bold text-[var(--text-primary)]">{users.length}</p>
          <p className="text-xs text-[var(--text-secondary)]">Staff Members</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <p className="text-2xl font-bold text-[var(--accent)]">
            {users.reduce((s, u) => s + (u.course_assignments?.length || 0), 0)}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">Course Assignments</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <p className="text-2xl font-bold text-emerald-600">
            {users.reduce((s, u) => s + (u.company_assignments?.length || 0), 0)}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">Company Assignments</p>
        </div>
      </div>

      {/* User Table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
              <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">User</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Role</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Courses</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Companies</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--text-secondary)]">Details</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isExpanded = expandedUser === user.id;
              return (
                <tr key={user.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">{user.name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      user.role === 'placement_head'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                        : 'bg-[var(--accent-soft)] text-[var(--accent-strong)]'
                    }`}>
                      {user.role === 'placement_head' ? 'Head' : 'Member'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(user.course_assignments || []).slice(0, 2).map((ca) => (
                        <span key={ca.id} className="rounded-full border border-[var(--accent-soft)] bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] text-[var(--accent-strong)]">
                          {ca.course_name}
                        </span>
                      ))}
                      {(user.course_assignments || []).length > 2 && (
                        <span className="text-[11px] text-[var(--text-secondary)]">
                          +{(user.course_assignments || []).length - 2}
                        </span>
                      )}
                      {(!user.course_assignments || user.course_assignments.length === 0) && (
                        <span className="text-[11px] text-[var(--text-secondary)]">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(user.company_assignments || []).slice(0, 2).map((ca) => (
                        <span key={ca.id} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {ca.company_name}
                        </span>
                      ))}
                      {(user.company_assignments || []).length > 2 && (
                        <span className="text-[11px] text-[var(--text-secondary)]">
                          +{(user.company_assignments || []).length - 2}
                        </span>
                      )}
                      {(!user.company_assignments || user.company_assignments.length === 0) && (
                        <span className="text-[11px] text-[var(--text-secondary)]">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setExpandedUser(isExpanded ? null : user.id)}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      {isExpanded ? 'Collapse' : 'Expand'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Expanded Detail Panel */}
      {expandedUser && (() => {
        const user = users.find(u => u.id === expandedUser);
        if (!user) return null;
        return (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-6">
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-4">
              {user.name} — Assignments
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Course Assignments */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-[var(--accent)]">📚 Course Assignments</h4>
                  <button
                    onClick={() => {
                      setCourseForm({ userId: user.id, courseId: '', courseName: '' });
                      setShowCourseModal(true);
                    }}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    + Add
                  </button>
                </div>
                {(!user.course_assignments || user.course_assignments.length === 0) ? (
                  <p className="text-xs text-[var(--text-secondary)] italic">No courses assigned</p>
                ) : (
                  <div className="space-y-2">
                    {user.course_assignments.map((ca) => (
                      <div key={ca.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">{ca.course_name}</p>
                          <p className="text-[11px] text-[var(--text-secondary)]">ID: {ca.course_id}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveCourseAssignment(ca.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Company Assignments */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-emerald-600">🏢 Company Assignments</h4>
                  <button
                    onClick={() => {
                      setCompanyForm({ userId: user.id, companyName: '' });
                      setShowCompanyModal(true);
                    }}
                    className="text-xs text-emerald-600 hover:underline"
                  >
                    + Add
                  </button>
                </div>
                {(!user.company_assignments || user.company_assignments.length === 0) ? (
                  <p className="text-xs text-[var(--text-secondary)] italic">No companies assigned</p>
                ) : (
                  <div className="space-y-2">
                    {user.company_assignments.map((ca) => (
                      <div key={ca.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
                        <p className="text-sm font-medium text-[var(--text-primary)]">{ca.company_name}</p>
                        <button
                          onClick={() => handleRemoveCompanyAssignment(ca.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ Course Assignment Modal ════════════════════════════════════════ */}
      {showCourseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCourseModal(false)}>
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">📚 Assign Course to Staff</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Staff Member</label>
                <select
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  value={courseForm.userId}
                  onChange={(e) => setCourseForm(p => ({ ...p, userId: e.target.value }))}
                >
                  <option value="">Select staff member…</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Course ID</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  placeholder="e.g. CS101"
                  value={courseForm.courseId}
                  onChange={(e) => setCourseForm(p => ({ ...p, courseId: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Course Name</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  placeholder="e.g. Data Structures"
                  value={courseForm.courseName}
                  onChange={(e) => setCourseForm(p => ({ ...p, courseName: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCourseModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignCourse}
                disabled={saving || !courseForm.userId || !courseForm.courseId || !courseForm.courseName}
                className="px-4 py-2 text-sm rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] disabled:opacity-50"
              >
                {saving ? 'Assigning…' : 'Assign Course'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Company Assignment Modal ═══════════════════════════════════════ */}
      {showCompanyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCompanyModal(false)}>
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">🏢 Assign Company to Staff</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Staff Member</label>
                <select
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  value={companyForm.userId}
                  onChange={(e) => setCompanyForm(p => ({ ...p, userId: e.target.value }))}
                >
                  <option value="">Select staff member…</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Company Name</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  placeholder="e.g. Google, TCS, Infosys"
                  value={companyForm.companyName}
                  onChange={(e) => setCompanyForm(p => ({ ...p, companyName: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCompanyModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignCompany}
                disabled={saving || !companyForm.userId || !companyForm.companyName}
                className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'Assigning…' : 'Assign Company'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
