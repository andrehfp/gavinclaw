'use client';

import { useAuth } from '@workos-inc/authkit-nextjs/components';
import { Loader2, Moon, Sun } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';

type OnboardingStatusResponse = {
  requiresOrganizationSetup: boolean;
  suggestedOrganizationName: string;
  context: {
    orgId: string;
    orgName: string;
    role: 'admin' | 'user';
  } | null;
};

type Theme = 'dark' | 'light';

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return payload.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export default function OnboardingPage() {
  const { user, loading, signOut } = useAuth();
  const [theme, setTheme] = useState<Theme>('dark');
  const [organizationName, setOrganizationName] = useState('');
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const userDisplay = useMemo(() => {
    if (!user) {
      return null;
    }

    const firstName = typeof user.firstName === 'string' ? user.firstName.trim() : '';
    if (firstName.length > 0) {
      return firstName;
    }

    const email = typeof user.email === 'string' ? user.email.trim() : '';
    if (email.length > 0) {
      return email;
    }

    return 'there';
  }, [user]);

  useEffect(() => {
    const saved = window.localStorage.getItem('controlplane-theme');
    if (saved === 'light' || saved === 'dark') {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('controlplane-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    return () => {
      document.documentElement.classList.remove('dark');
    };
  }, [theme]);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user) {
      window.location.href = '/sign-in';
      return;
    }

    let cancelled = false;
    async function loadStatus() {
      setIsLoadingStatus(true);
      setErrorMessage(null);

      try {
        const response = await fetch('/api/protected/onboarding/organization', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(await readError(response, 'Could not load organization setup state'));
        }

        const payload = (await response.json()) as OnboardingStatusResponse;
        if (cancelled) {
          return;
        }

        if (!payload.requiresOrganizationSetup) {
          window.location.href = '/';
          return;
        }

        setOrganizationName(payload.suggestedOrganizationName);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unexpected onboarding error');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingStatus(false);
        }
      }
    }

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  async function handleCreateOrganization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCreating) {
      return;
    }

    setErrorMessage(null);
    setIsCreating(true);

    try {
      const response = await fetch('/api/protected/onboarding/organization', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ organizationName }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, 'Could not create organization'));
      }

      window.location.href = '/';
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unexpected onboarding error');
    } finally {
      setIsCreating(false);
    }
  }

  if (loading || isLoadingStatus) {
    return (
      <main className={styles.shell} data-theme={theme}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandDecor} aria-hidden />
            <div className={styles.brandCopy}>
              <p className={styles.brandSystem}>ControlPlane</p>
              <p className={styles.brandName}>Organization setup</p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button
              className={styles.themeToggle}
              type="button"
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>
        <section className={styles.panel}>
          <p className={styles.statusText}>Preparing your workspace setup…</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className={styles.shell} data-theme={theme}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandDecor} aria-hidden />
          <div className={styles.brandCopy}>
            <p className={styles.brandSystem}>ControlPlane</p>
            <p className={styles.brandName}>Organization setup</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.themeToggle}
            type="button"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            className={styles.ghostButton}
            type="button"
            onClick={() => {
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <section className={styles.panel}>
        <p className={styles.kicker}>Organization setup</p>
        <h1 className={styles.title}>Create your company workspace</h1>
        <p className={styles.subtitle}>
          Hi {userDisplay}. Set the organization name used across your admin dashboard and invitations.
        </p>

        <form className={styles.form} onSubmit={handleCreateOrganization}>
          <label className={styles.label} htmlFor="organizationName">Organization name</label>
          <input
            id="organizationName"
            className={styles.input}
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            placeholder="Acme Inc."
            minLength={2}
            maxLength={80}
            required
            autoFocus
          />

          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

          <button className={styles.primaryButton} type="submit" disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className={styles.spinner} />
                Creating workspace…
              </>
            ) : 'Create workspace'}
          </button>
        </form>
      </section>
    </main>
  );
}
