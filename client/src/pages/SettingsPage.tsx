// LabBuddy — Account settings page
//
// Sections:
//   1. Profile        — name, email
//   2. Security       — change password
//   3. Children       — list, add, edit, remove (delegates to ChildProfileForm)
//   4. Subscription   — current tier + link to upgrade / billing portal
//   5. Danger Zone    — delete account (requires password + confirmation word)
//
// Renders inside the existing parent-dashboard styling system; no new CSS
// file needed — the class names below reuse and extend the parent.css
// tokens that are already loaded in App.tsx.

import { useCallback, useEffect, useState } from 'react';
import type { ChildProfile, ParentAccount, SubscriptionTier, TierLimits } from '../../../shared/types';
import {
  fetchAccountSummary,
  updateParentProfile,
  changeParentPassword,
  deleteParentAccount,
  parentLogout,
  deleteChild,
  type AccountSummary,
} from '../api/parent';
import ChildProfileForm from '../components/ChildProfileForm';

interface SettingsPageProps {
  onClose: () => void;
  /** Called after a successful delete-account flow. */
  onLogout: () => void;
}

type SectionId = 'profile' | 'security' | 'children' | 'subscription' | 'danger';

const SECTIONS: Array<{ id: SectionId; label: string; icon: string }> = [
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'security', label: 'Security', icon: '🔒' },
  { id: 'children', label: 'Children', icon: '🧒' },
  { id: 'subscription', label: 'Subscription', icon: '💳' },
  { id: 'danger', label: 'Danger Zone', icon: '⚠️' },
];

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: 'Free',
  family: 'Family',
  classroom: 'Classroom',
};

export default function SettingsPage({ onClose, onLogout }: SettingsPageProps) {
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('profile');

  const reload = useCallback(async () => {
    setLoadErr(null);
    try {
      const data = await fetchAccountSummary();
      setSummary(data);
    } catch (err) {
      setLoadErr((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loadErr) {
    return (
      <div className="parent-dashboard parent-dashboard--error">
        <div className="parent-dashboard__error">
          <h2>Couldn't load settings</h2>
          <p>{loadErr}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn--primary" onClick={() => void reload()}>
              Try again
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="parent-dashboard parent-dashboard--loading">
        <div className="parent-dashboard__loading">Loading account…</div>
      </div>
    );
  }

  return (
    <div className="parent-dashboard">
      <header className="parent-dashboard__header">
        <div className="parent-dashboard__header-left">
          <button
            type="button"
            className="parent-dashboard__close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ✕
          </button>
          <h1 className="parent-dashboard__title">Account settings</h1>
        </div>
        <div className="parent-dashboard__header-right">
          <span style={{ color: '#6C63FF', fontWeight: 600, fontSize: 14 }}>
            {summary.parent.email}
          </span>
        </div>
      </header>

      <div
        className="parent-dashboard__body"
        style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}
      >
        {/* Sidebar nav */}
        <nav
          aria-label="Settings sections"
          style={{
            flex: '0 0 200px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            position: 'sticky',
            top: 16,
          }}
        >
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSection(s.id)}
              className="settings-nav-item"
              style={{
                textAlign: 'left',
                padding: '10px 14px',
                borderRadius: 10,
                border: 'none',
                background:
                  activeSection === s.id ? 'rgba(108,99,255,0.12)' : 'transparent',
                color: activeSection === s.id ? '#6C63FF' : '#2D3436',
                fontWeight: activeSection === s.id ? 700 : 500,
                cursor: 'pointer',
                fontSize: 15,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span aria-hidden>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>

        {/* Section content */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {activeSection === 'profile' && (
            <ProfileSection parent={summary.parent} onSaved={reload} />
          )}
          {activeSection === 'security' && <SecuritySection />}
          {activeSection === 'children' && (
            <ChildrenSection
              children={summary.children}
              maxChildren={summary.subscription.limits.maxChildProfiles}
              onChange={reload}
            />
          )}
          {activeSection === 'subscription' && (
            <SubscriptionSection
              tier={summary.subscription.tier}
              status={summary.subscription.status}
              limits={summary.subscription.limits}
              childrenCount={summary.subscription.childrenCount}
            />
          )}
          {activeSection === 'danger' && <DangerSection onDeleted={onLogout} />}
        </div>
      </div>
    </div>
  );
}

// ---------- Helpers ----------

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: 'white',
        borderRadius: 16,
        padding: '20px 22px',
        boxShadow: '0 2px 10px rgba(108,99,255,0.06)',
      }}
    >
      <h2 style={{ margin: '0 0 6px', fontSize: 20 }}>{title}</h2>
      {description && (
        <p style={{ margin: '0 0 14px', color: '#636E72', fontSize: 14 }}>
          {description}
        </p>
      )}
      {children}
    </section>
  );
}

function Toast({ kind, message }: { kind: 'ok' | 'err'; message: string }) {
  return (
    <div
      role="status"
      style={{
        marginTop: 12,
        padding: '8px 12px',
        borderRadius: 8,
        background: kind === 'ok' ? 'rgba(46,204,113,0.12)' : 'rgba(231,76,60,0.10)',
        color: kind === 'ok' ? '#2ECC71' : '#E74C3C',
        fontWeight: 600,
        fontSize: 14,
      }}
    >
      {message}
    </div>
  );
}

// ---------- Profile ----------

function ProfileSection({
  parent,
  onSaved,
}: {
  parent: ParentAccount;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(parent.name);
  const [email, setEmail] = useState(parent.email);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const dirty = name !== parent.name || email !== parent.email;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      await updateParentProfile({
        name: name !== parent.name ? name : undefined,
        email: email !== parent.email ? email : undefined,
      });
      await onSaved();
      setMsg({ kind: 'ok', text: 'Profile updated.' });
    } catch (err) {
      setMsg({ kind: 'err', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Profile" description="Your name and email address.">
      <form onSubmit={onSubmit} className="auth-modal__form">
        <div className="auth-modal__field">
          <label htmlFor="settings-name">Name</label>
          <input
            id="settings-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
          />
        </div>
        <div className="auth-modal__field">
          <label htmlFor="settings-email">Email</label>
          <input
            id="settings-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          className="btn btn--primary"
          disabled={!dirty || saving}
        >
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
        {msg && <Toast kind={msg.kind} message={msg.text} />}
      </form>
    </SectionCard>
  );
}

// ---------- Security ----------

function SecuritySection() {
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setMsg(null);
    if (newPassword.length < 6) {
      setMsg({ kind: 'err', text: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirm) {
      setMsg({ kind: 'err', text: 'Passwords do not match.' });
      return;
    }
    setSaving(true);
    try {
      await changeParentPassword(newPassword);
      setMsg({ kind: 'ok', text: 'Password updated.' });
      setNew('');
      setConfirm('');
    } catch (err) {
      setMsg({ kind: 'err', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Security"
      description="Set a new password. You'll stay signed in on this device."
    >
      <form onSubmit={onSubmit} className="auth-modal__form">
        <div className="auth-modal__field">
          <label htmlFor="pw-new">New password</label>
          <input
            id="pw-new"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            required
            minLength={6}
          />
        </div>
        <div className="auth-modal__field">
          <label htmlFor="pw-confirm">Confirm new password</label>
          <input
            id="pw-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
          />
        </div>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Updating…' : 'Update password'}
        </button>
        {msg && <Toast kind={msg.kind} message={msg.text} />}
      </form>
    </SectionCard>
  );
}

// ---------- Children ----------

function ChildrenSection({
  children,
  maxChildren,
  onChange,
}: {
  children: ChildProfile[];
  maxChildren: number;
  onChange: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ChildProfile | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const atCapacity = children.length >= maxChildren;

  // ChildProfileForm handles its own API calls; we just refresh on save.
  const onSaved = async () => {
    setErr(null);
    setAdding(false);
    setEditing(null);
    await onChange();
  };

  const onRemove = async (id: string, name: string) => {
    if (!window.confirm(`Remove ${name}? Their notebook entries and progress will be deleted.`)) {
      return;
    }
    setBusyId(id);
    setErr(null);
    try {
      await deleteChild(id);
      await onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SectionCard
      title="Children"
      description={`${children.length} of ${maxChildren} profile${maxChildren === 1 ? '' : 's'} used.`}
    >
      {err && <Toast kind="err" message={err} />}
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
        {children.map((c) => (
          <li
            key={c.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(108,99,255,0.06)',
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 22 }}>{c.avatar ?? '🧒'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              <div style={{ fontSize: 13, color: '#636E72' }}>
                Age {c.age}
                {c.gradeLevel != null && ` · Grade ${c.gradeLevel}`}
              </div>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setEditing(c)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => void onRemove(c.id, c.name)}
              disabled={busyId === c.id}
              style={{ color: '#E74C3C' }}
            >
              {busyId === c.id ? '…' : 'Remove'}
            </button>
          </li>
        ))}
        {children.length === 0 && (
          <li style={{ color: '#636E72', padding: '8px 4px' }}>
            No children yet. Add one to start a learning profile.
          </li>
        )}
      </ul>
      {!adding && !editing && (
        <button
          type="button"
          className="btn btn--primary"
          disabled={atCapacity}
          onClick={() => setAdding(true)}
        >
          {atCapacity ? `Limit reached (${maxChildren})` : '+ Add a child'}
        </button>
      )}

      {adding && (
        <div style={{ marginTop: 14 }}>
          <ChildProfileForm
            mode="create"
            onSave={() => void onSaved()}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
      {editing && (
        <div style={{ marginTop: 14 }}>
          <ChildProfileForm
            mode="edit"
            existing={editing}
            onSave={() => void onSaved()}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}
    </SectionCard>
  );
}

// ---------- Subscription ----------

function SubscriptionSection({
  tier,
  status,
  limits,
  childrenCount,
}: {
  tier: SubscriptionTier;
  status: string;
  limits: TierLimits;
  childrenCount: number;
}) {
  return (
    <SectionCard
      title="Subscription"
      description="Your current plan and what it includes."
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '14px 16px',
          borderRadius: 12,
          background:
            'linear-gradient(135deg, rgba(108,99,255,0.10), rgba(78,205,196,0.10))',
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, color: '#6C63FF' }}>
            {TIER_LABELS[tier]}
          </div>
          <div style={{ fontSize: 13, color: '#636E72', marginTop: 2 }}>
            Status: {status === 'none' ? 'free tier' : status}
          </div>
        </div>
        {tier === 'free' ? (
          <a href="/upgrade" className="btn btn--primary">
            Upgrade
          </a>
        ) : (
          <a href="/upgrade" className="btn btn--ghost">
            Manage
          </a>
        )}
      </div>

      <dl style={{ margin: 0, padding: 0, fontSize: 14 }}>
        <DL k="Experiments per day" v={limitsLabel(limits.maxExperimentsPerDay)} />
        <DL
          k="Child profiles"
          v={`${childrenCount} used of ${limits.maxChildProfiles}`}
        />
        <DL k="Syllabus uploads" v={limits.syllabusUploads ? 'Included' : 'Upgrade to unlock'} />
        <DL k="DIY guides" v={limits.diyGuides ? 'Included' : 'Upgrade to unlock'} />
        <DL k="Lab notebook" v={limits.labNotebook ? 'Included' : 'Upgrade to unlock'} />
        <DL k="Priority support" v={limits.prioritySupport ? 'Included' : '—'} />
      </dl>
    </SectionCard>
  );
}

function limitsLabel(n: number): string {
  return n >= 999 ? 'Unlimited' : `Up to ${n}`;
}

function DL({ k, v }: { k: string; v: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '6px 0',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
      }}
    >
      <dt style={{ color: '#636E72' }}>{k}</dt>
      <dd style={{ margin: 0, fontWeight: 600 }}>{v}</dd>
    </div>
  );
}

// ---------- Danger Zone ----------

function DangerSection({ onDeleted }: { onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirmWord, setConfirmWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canDelete = confirmWord === 'DELETE' && !busy;

  const onDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canDelete) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteParentAccount();
      // deleteParentAccount() already signs out. Belt + suspenders.
      await parentLogout();
      onDeleted();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="Danger Zone"
      description="Irreversible actions. Read carefully."
    >
      <div
        style={{
          border: '1.5px solid rgba(231,76,60,0.35)',
          borderRadius: 12,
          padding: '14px 16px',
          background: 'rgba(231,76,60,0.04)',
        }}
      >
        <h3 style={{ margin: '0 0 6px', fontSize: 16, color: '#E74C3C' }}>
          Delete account
        </h3>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: '#636E72' }}>
          Permanently deletes your account, all child profiles, every notebook
          entry, all chat history, all uploaded syllabi, and all DIY guides.
          This cannot be undone.
        </p>

        {!open ? (
          <button
            type="button"
            className="btn btn--ghost"
            style={{ color: '#E74C3C', borderColor: 'rgba(231,76,60,0.4)' }}
            onClick={() => setOpen(true)}
          >
            I want to delete my account
          </button>
        ) : (
          <form onSubmit={onDelete} className="auth-modal__form">
            <div className="auth-modal__field">
              <label htmlFor="del-confirm">
                Type <code>DELETE</code> to confirm
              </label>
              <input
                id="del-confirm"
                type="text"
                value={confirmWord}
                onChange={(e) => setConfirmWord(e.target.value)}
                autoCapitalize="characters"
                required
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={!canDelete}
                style={{
                  background: canDelete ? '#E74C3C' : 'rgba(231,76,60,0.4)',
                }}
              >
                {busy ? 'Deleting…' : 'Permanently delete'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setOpen(false);
                  setConfirmWord('');
                  setErr(null);
                }}
              >
                Cancel
              </button>
            </div>
            {err && <Toast kind="err" message={err} />}
          </form>
        )}
      </div>
    </SectionCard>
  );
}
