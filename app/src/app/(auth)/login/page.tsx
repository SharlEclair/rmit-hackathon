'use client';

import { useState, type FormEvent } from 'react';

/**
 * The one sign-in screen, shared by both roles (`07` S3.1; WP-03: "Tutor and student share one
 * sign-in screen; the role decides the landing route").
 *
 * **Naming (`04` D13).** Nothing on this screen or in this file names an internal capability as an
 * agent or a model. The only actor visible to a user is a person signing in, and the product name.
 * This is why the copy says "AssignMate" and never names the thing behind it.
 *
 * **Markup.** One `main`, one `h1`, one `form`, `label`-bound inputs, and a `<p role="alert">` for
 * the error. Every control is labelled and keyboard-reachable.
 *
 * **Styled against the token layer, which now exists.** An earlier revision of this file carried no
 * Tailwind classes, on the reasoning that "the design tokens land with the first UI phase (D75) and
 * a utility class referencing a custom property that does not exist yet is a broken style, not a
 * style." That was correct when written and became false the moment D75 landed -- and nothing in the
 * build checks comments, so this page stayed bare while the rest of the product was styled (I-63).
 * The stale rationale is removed rather than left to mislead the next reader.
 *
 * The conventions here are copied from the components rather than invented: `rounded-card
 * border border-solid border-default bg-card` is `state-panel.tsx`'s card, `rounded-control` is
 * `assistant-panel.tsx`'s composer, and the type utilities (`heading-1`, `heading-3`, `body`,
 * `tight`, `ui-sm`) come from `typography.css`. **No hex value appears in this file** -- every colour
 * is a token (`17` S6.1 rule 2).
 *
 * The panel is deliberately narrow and centred: one column, one action, no navigation. A sign-in
 * screen that offers choices is a sign-in screen that delays the product.
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
    <main className="flex min-h-screen items-center justify-center bg-page px-4 py-12">
      <div className="w-full max-w-sm">
        <header className="mb-6 flex flex-col gap-1">
          <h1 className="heading-1 text-ink">AssignMate</h1>
          <p className="tight text-muted">An assignment workspace for RMIT students and tutors.</p>
        </header>

        <div className="rounded-card border border-solid border-default bg-card p-4">
          <h2 className="heading-3 mb-4 text-ink">Sign in</h2>

          {error !== null ? (
            // `07` S2.1: the error treatment is `--state-error` on the border and the message. It is
            // `role="alert"` so a screen reader announces it without moving focus off the form.
            <p
              role="alert"
              className="mb-4 rounded-control border border-solid border-error bg-card px-3 py-2 tight text-error"
            >
              {error}
            </p>
          ) : null}

          <form onSubmit={onSubmit} method="post" action={LOGIN_PATH} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="ui-sm text-muted" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                className="rounded-control border border-solid border-default bg-card px-3 py-2 body text-ink"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="ui-sm text-muted" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                className="rounded-control border border-solid border-default bg-card px-3 py-2 body text-ink"
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="rounded-control border border-solid border-default bg-ink px-4 py-2 tight text-inverse disabled:opacity-60"
            >
              {pending ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="ui-sm mt-4 text-muted">Students: your workspace. Tutors: your courses.</p>
        {/* D42: no "forgot password" link, no SSO and no Canvas sign-in in the MVP. */}
      </div>
    </main>
  );
}
