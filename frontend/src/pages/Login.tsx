import { useId, useState } from 'react';

import { api, setRole, setToken, type ApiError } from '../services/api';

interface LoginResult {
  token: string;
  user: { id: number; email: string; displayName: string; role: string };
}

export function Login({ onSignedIn }: { onSignedIn: (user: LoginResult['user']) => void }) {
  const emailId = useId();
  const pwId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('กรอกอีเมลและรหัสผ่านให้ครบ');
      return;
    }
    setBusy(true);
    setError('');
    api<LoginResult>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      .then((r) => {
        setToken(r.token);
        setRole(r.user.role);
        onSignedIn(r.user);
      })
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary font-bold text-on-primary">
            GS
          </div>
          <span className="text-section font-semibold text-ink">Condition Monitoring</span>
        </div>

        <div className="space-y-4 rounded-lg border border-hairline bg-surface p-6">
          <div>
            <label htmlFor={emailId} className="mb-1 block text-caption font-medium text-ink-secondary">
              อีเมล
            </label>
            <input
              id={emailId}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-11 w-full rounded-sm border border-hairline px-3 text-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            />
          </div>

          <div>
            <label htmlFor={pwId} className="mb-1 block text-caption font-medium text-ink-secondary">
              รหัสผ่าน
            </label>
            <input
              id={pwId}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-11 w-full rounded-sm border border-hairline px-3 text-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-sm bg-danger-surface px-3 py-2 text-body text-danger-ink">
              <span aria-hidden="true">■ </span>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="min-h-11 w-full rounded-md bg-primary text-body font-semibold text-on-primary disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </div>
      </form>
    </div>
  );
}
