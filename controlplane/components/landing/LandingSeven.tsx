'use client';

import Link from 'next/link';
import {
  Shield,
  Clock,
  FileCheck,
  Inbox,
  Gavel,
  RefreshCw,
  FolderGit2,
  History,
  GitBranch,
  ArrowRight,
} from 'lucide-react';
import styles from './LandingSeven.module.css';

const activityFeed = [
  { time: '14:32:01', status: 'success', action: 'deploy  prod-api v2.3.1', badge: 'APPROVED' },
  { time: '14:31:58', status: 'warning', action: 'DELETE  /users/bulk-export', badge: 'PENDING' },
  { time: '14:31:44', status: 'dim',     action: 'GET     analytics.warehouse', badge: 'AUTO' },
  { time: '14:31:39', status: 'error',   action: 'POST    production.billing', badge: 'BLOCKED' },
  { time: '14:31:22', status: 'success', action: 'CALL    payment-gateway.refund', badge: 'APPROVED' },
  { time: '14:31:11', status: 'dim',     action: 'READ    audit.trail.export', badge: 'AUTO' },
];

const metrics = [
  { value: '99.99%', label: 'Uptime SLA for production workspaces' },
  { value: '< 15m',  label: 'Critical support response target' },
  { value: '0',      label: 'Unattributed high-risk actions' },
  { value: '2×',     label: 'Faster incident review cycles' },
  { value: '24/7',   label: 'Policy and runtime visibility' },
  { value: '1',      label: 'Timeline for prompts, tools, and approvals' },
];

const problemItems = [
  {
    title: 'Approvals die in chat threads',
    description: 'Critical policy decisions get buried in Slack and docs, then disappear when incidents need answers.',
    icon: GitBranch,
  },
  {
    title: 'Retries quietly corrupt state',
    description: 'Delayed webhooks and duplicate events create billing and credit drift unless processing is idempotent.',
    icon: RefreshCw,
  },
  {
    title: 'Audit prep becomes a fire drill',
    description: 'Teams lose hours stitching evidence across systems every time security or finance asks for proof.',
    icon: FileCheck,
  },
];

const featureItems = [
  {
    title: 'Approval Inbox',
    description:
      'Route every high-risk action into one queue with owner, context, and decision history. No scattered approval trails.',
    icon: Inbox,
    span: 2,
  },
  {
    title: 'Policy Rules Engine',
    description: 'Enforce role, project, and risk-based gates before risky actions execute.',
    icon: Gavel,
    span: 1,
  },
  {
    title: 'Retry-Safe Events',
    description: 'Use idempotent lifecycle handling to prevent duplicate grants and subscription mismatches.',
    icon: RefreshCw,
    span: 1,
  },
  {
    title: 'Project Isolation',
    description: 'Separate project context cleanly while preserving shared governance controls.',
    icon: FolderGit2,
    span: 1,
  },
  {
    title: 'Complete Audit Trail',
    description: 'Record actor, timestamp, policy reason, and outcome for every governed action.',
    icon: History,
    span: 1,
  },
  {
    title: 'Operational Timeline',
    description:
      'See prompts, tool calls, approvals, retries, and failures in one stream. Incident review starts with facts, not guesswork.',
    icon: Clock,
    span: 2,
  },
];

const workflowItems = [
  {
    step: '01',
    title: 'Capture runtime context',
    description: 'Log prompt, actor, project, and requested action before execution starts.',
  },
  {
    step: '02',
    title: 'Enforce policy in real time',
    description: 'Send risky actions to approval while low-risk operations continue automatically.',
  },
  {
    step: '03',
    title: 'Process retries idempotently',
    description: 'Handle delayed events and failures without duplicate side effects or state drift.',
  },
  {
    step: '04',
    title: 'Export proof on demand',
    description: 'Generate audit-ready evidence for security, finance, and operations in minutes.',
  },
];

const testimonialItems = [
  {
    quote:
      'We cut incident review from 3 hours to 45 minutes because every approval, prompt, and tool action is already linked.',
    author: 'Head of Platform',
    company: 'Fintech Org',
  },
  {
    quote: 'Security and product finally review the same timeline. We spend less time debating incidents and more time shipping.',
    author: 'VP Engineering',
    company: 'SaaS Company',
  },
  {
    quote: 'Retry-safe lifecycle handling eliminated billing drift during webhook delays. That one fix paid for rollout.',
    author: 'Staff Engineer',
    company: 'B2B Software Team',
  },
];

const faqItems = [
  {
    question: 'Do we need to replace our current AI stack?',
    answer:
      'No. Keep your current models and tools. Most teams start by routing one high-risk workflow through ControlPlane, then expand.',
  },
  {
    question: 'Will this slow down engineering teams?',
    answer: 'Only high-risk actions pause for approval. Everyday low-risk operations continue automatically.',
  },
  {
    question: 'Can this support compliance audits?',
    answer: 'Yes. Export actor-level evidence with timestamps, policy decisions, and outcomes from one timeline.',
  },
  {
    question: 'How long does onboarding take?',
    answer: 'Most teams launch a guided pilot in under a week by integrating one workflow first.',
  },
];

export function LandingSeven() {
  return (
    <main className={styles.page}>
      <div className={styles.gridBg} aria-hidden />

      {/* ── Header ── */}
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <div className={styles.brandMark}>
            <Shield className="w-4 h-4" />
          </div>
          ControlPlane
        </Link>
        <nav className={styles.nav}>
          <a href="#features">Features</a>
          <a href="#workflow">How it works</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className={styles.headerActions}>
          <a href="/sign-in" className={styles.signIn}>
            Sign in
          </a>
          <a href="/sign-up" className={styles.bookDemo}>
            Book demo <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Production AI Governance</p>
          <h1 className={styles.headline}>
            Boring operations beat brilliant prompts.
            <br />
            <em>Control every high-risk action.</em>
          </h1>
          <p className={styles.subline}>
            One governed system for prompts, approvals, execution, and recovery so engineering moves fast while
            security gets real evidence.
          </p>
          <div className={styles.heroActions}>
            <a href="/sign-up" className={styles.primaryCta}>
              Get your architecture walkthrough
              <ArrowRight className="w-4 h-4" />
            </a>
            <a href="/sign-in" className={styles.secondaryCta}>
              Access your workspace
            </a>
          </div>
          <div className={styles.trustPills}>
            {['SOC 2 controls', '99.99% uptime SLA', '15-min critical response', 'Role-based approvals'].map((t) => (
              <span key={t} className={styles.trustPill}>
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.terminal}>
          <div className={styles.terminalHeader}>
            <div className={styles.terminalDots}>
              <span />
              <span />
              <span />
            </div>
            <span className={styles.terminalTitle}>
              <span className={styles.liveDot} />
              LIVE OPERATIONS
            </span>
            <span className={styles.terminalPolicies}>4 policies active</span>
          </div>
          <div className={styles.terminalBody}>
            {activityFeed.map((item, i) => (
              <div
                key={i}
                className={styles.feedRow}
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <span className={styles.feedTime}>{item.time}</span>
                <span
                  className={`${styles.feedDot} ${
                    item.status === 'success'
                      ? styles.dotSuccess
                      : item.status === 'warning'
                        ? styles.dotWarning
                        : item.status === 'error'
                          ? styles.dotError
                          : styles.dotDim
                  }`}
                />
                <span className={styles.feedAction}>{item.action}</span>
                <span
                  className={`${styles.feedBadge} ${
                    item.badge === 'APPROVED'
                      ? styles.badgeApproved
                      : item.badge === 'PENDING'
                        ? styles.badgePending
                        : item.badge === 'BLOCKED'
                          ? styles.badgeBlocked
                          : styles.badgeAuto
                  }`}
                >
                  {item.badge}
                </span>
              </div>
            ))}
          </div>
          <div className={styles.terminalFooter}>
            <span className={styles.terminalCursor}>▌</span>
            <span>monitoring governed workspace</span>
          </div>
        </div>
      </section>

      {/* ── Ticker ── */}
      <div className={styles.ticker}>
        <div className={styles.tickerTrack}>
          {[...metrics, ...metrics].map((m, i) => (
            <span key={i} className={styles.tickerItem}>
              <strong>{m.value}</strong>
              <span>{m.label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Stats ── */}
      <section className={styles.statsSection}>
        <div className={styles.statsGrid}>
          {metrics.map((m) => (
            <div key={m.label} className={styles.statCard}>
              <p className={styles.statValue}>{m.value}</p>
              <span className={styles.statLabel}>{m.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Problems ── */}
      <section className={styles.section} id="problems">
        <p className={styles.sectionEyebrow}>Why teams switch</p>
        <h2 className={styles.sectionTitle}>
          Most AI incidents start as workflow failures,
          <br />
          not model failures.
        </h2>
        <div className={styles.problemGrid}>
          {problemItems.map((item) => (
            <div key={item.title} className={styles.problemCard}>
              <div className={styles.cardIcon}>
                <item.icon className="w-5 h-5" />
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className={styles.section} id="features">
        <p className={styles.sectionEyebrow}>Feature stack</p>
        <h2 className={styles.sectionTitle}>
          Built for the controls that prevent
          <br />
          expensive production mistakes.
        </h2>
        <div className={styles.bentoGrid}>
          {featureItems.map((item) => (
            <div
              key={item.title}
              className={`${styles.bentoCard} ${item.span === 2 ? styles.bentoSpan2 : ''}`}
            >
              <div className={styles.bentoIcon}>
                <item.icon className="w-5 h-5" />
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Workflow ── */}
      <section className={styles.section} id="workflow">
        <p className={styles.sectionEyebrow}>How teams roll this out</p>
        <h2 className={styles.sectionTitle}>
          Start with one risky workflow.
          <br />
          Expand after week-one proof.
        </h2>
        <div className={styles.workflowGrid}>
          {workflowItems.map((item, i) => (
            <div key={item.step} className={styles.workflowStep}>
              <div className={styles.stepNumber}>{item.step}</div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              {i < workflowItems.length - 1 && (
                <div className={styles.stepArrow}>
                  <ArrowRight className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className={styles.section}>
        <p className={styles.sectionEyebrow}>Operator proof</p>
        <h2 className={styles.sectionTitle}>What operators report after rollout</h2>
        <div className={styles.testimonialGrid}>
          {testimonialItems.map((item) => (
            <div key={item.author} className={styles.testimonialCard}>
              <p className={styles.testimonialQuote}>&ldquo;{item.quote}&rdquo;</p>
              <div className={styles.testimonialMeta}>
                <strong>{item.author}</strong>
                <span>{item.company}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className={styles.ctaSection}>
        <p className={styles.ctaEyebrow}>Next step</p>
        <h2 className={styles.ctaTitle}>
          Bring one high-risk workflow.
          <br />
          Leave with a rollout plan your security lead will approve.
        </h2>
        <p className={styles.ctaSubline}>
          In 45 minutes, we map failure points, policy gates, and retry paths for your current production flow.
        </p>
        <div className={styles.ctaActions}>
          <a href="/sign-up" className={styles.primaryCta}>
            Book your implementation session
            <ArrowRight className="w-4 h-4" />
          </a>
          <a href="/sign-in" className={styles.secondaryCta}>
            Sign in and review your operations
          </a>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className={styles.section} id="faq">
        <p className={styles.sectionEyebrow}>FAQ</p>
        <h2 className={styles.sectionTitle}>Questions teams ask before rollout</h2>
        <div className={styles.faqList}>
          {faqItems.map((item) => (
            <details key={item.question} className={styles.faqItem}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <div className={styles.brandMark}>
              <Shield className="w-4 h-4" />
            </div>
            <span>ControlPlane</span>
          </div>
          <p>© 2026 ControlPlane, Inc. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
