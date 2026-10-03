'use client';

import { useState, type FormEvent } from 'react';

/**
 * The one sign-in screen, shared by both roles (`07` S3.1; WP-03: "Tutor and student share one
 * sign-in screen; the role decides the landing route").
 *
 * **Naming (`04` D13).** Nothing on this screen or in this file names an internal capability as an
 * agent or a model. The only actor visible to a user is a person signing in, and the product name.
 * This is why the copy says "Assignment Assistant" and never names the thing behind it.
 *
 * **Markup.** Minimal and semantic: one `main`, one `h1`, one `form`, `label`-bound inputs, and a
 * `<p role="alert">` for the error. No Tailwind utility classes, because the design tokens land
 * with the first UI phase (D75) and a utility class referencing a custom property that does not
 * exist yet is a broken style, not a style. The username/password autocomplete hints are the one
 * added affordance, because they cost nothing and are what makes the screen usable on a phone.
 *
 * **Client-side, deliberately.** `07` S3.1 requires an inline error panel that keeps the email
 * value and clears the password, plus a `Signing in...` button state. A plain `<form action=...>`
 * navigation cannot do either, so the form posts through `fetch` and reads the house error
 * envelope (`06` S5.3) to decide what to show.
 */

const LOGIN_PATH = '/login';
const STUDENT_LANDING_PATH = '/student';
const TUTOR_LANDING_PATH = '/tutor';

interface SessionResponse {
  user: { id: string; displayName: string; role: 'student' | 'tutor' };
  courses: Array<{ id: string; code: string; title: string; roleInCourse: 'student' | 'tutor' }>;
  redirectTo: string;
}

interface ApiErrorResponse {
  error: { code: string; message: string; details?: Record<string, unknown>; requestId: string };
}

/**
 * Post-sign-in destination.
 *
 * `redirectTo` is the server's answer and is used when it is a same-origin path. Otherwise the
 * role decides, which is the stated rule ("the role decides the landing route"). A
 * protocol-relative or absolute value is never followed, so a crafted response cannot turn the
 * sign-in screen into an open redirect.
 */
function resolveDestination(session: SessionResponse): string {
  const redirectTo = session.redirectTo;
  if (typeof redirectTo === 'string' && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
    return redirectTo;
  }
  return session.user.role === 'tutor' ? TUTOR_LANDING_PATH : STUDENT_LANDING_PATH;
}

/**
 * The `?next=` hint the middleware sets (`07` S3.2), accepted only as a same-origin path. The
 * student still has to sign in; this only decides where a successful sign-in lands.
 */
function resolveNextPath(): string | null {
  if (typeof window === 'undefined') return null;
  const next = new URLSearchParams(window.location.search).get('next');
  if (next === null || !next.startsWith('/') || next.startsWith('//')) return null;
  return next;
}

/** `Code` only. The message is host-fixed (`06` S5.3) and must never be rendered from a server body. */
function readErrorCode(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const error = (payload as ApiErrorResponse).error;
  if (typeof error !== 'object' || error === null) return null;
  return typeof error.code === 'string' ? error.code : null;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // The session cookie is httpOnly; the browser attaches and stores it, this file cannot.
        credentials: 'same-origin',
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        const code = readErrorCode(payload);
        if (code === 'RATE_LIMITED') {
          setError('Too many sign-in attempts. Try again in a few minutes.');
        } else if (code === 'VALIDATION_FAILED') {
          setError('Enter your email address and password.');
        } else {
          // Identical for an unknown email and a wrong password (`07` S3.1), so the form never
          // confirms which addresses exist.
          setError('Email or password is not correct.');
        }
        // `07` S3.1: the email field keeps its value and the password field clears.
        setPassword('');
        return;
      }

      const session = (await response.json()) as SessionResponse;
      const destination = resolveNextPath() ?? resolveDestination(session);
      // A full navigation, not a client route push: the server-rendered shell must see the new
      // cookie on its first request.
      window.location.assign(destination);
    } catch {
      setError('We could not reach the server. Nothing was changed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main>
      <h1>Assignment Assistant</h1>
      <h2>Sign in</h2>

      {error !== null ? (
        <p role="alert">{error}</p>
      ) : null}

      <form onSubmit={onSubmit} method="post" action={LOGIN_PATH}>
        <p>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </p>
        <p>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </p>
        <p>
          <button type="submit" disabled={pending}>
            {pending ? 'Signing in...' : 'Sign in'}
          </button>
        </p>
      </form>

      <p>Students: your workspace. Tutors: your courses.</p>
      {/* D42: no "forgot password" link, no SSO and no Canvas sign-in in the MVP. */}
    </main>
  );
}
