'use client';

import Link from 'next/link';
import {
  Shield,
  Clock,
  FileCheck,
  Zap,
  CheckCircle2,
  ArrowRight,
  Inbox,
  Gavel,
  RefreshCw,
  FolderGit2,
  History,
  GitBranch,
  Quote,
  ChevronRight,
  Lock,
  Server,
  Activity,
} from 'lucide-react';
import styles from './LandingSix.module.css';

const trustSignals = ['SOC 2 controls', '99.99% uptime SLA', '15-minute critical support', 'Role-based approvals'];

const statItems = [
  { value: '99.99%', label: 'Uptime target for production workspaces' },
  { value: '< 15m', label: 'Critical response target for support' },
  { value: '1', label: 'Unified timeline for prompts, tools, and approvals' },
  { value: '0', label: 'Unattributed high-risk actions in governed flows' },
  { value: '24/7', label: 'Operational and policy visibility' },
  { value: '2x', label: 'Faster incident review with complete context' },
];

const problemItems = [
  {
    title: 'Approval context is scattered',
    description: 'Policy decisions happen in chat, then vanish when incidents need reconstruction.',
    icon: GitBranch,
  },
  {
    title: 'Retries create state drift',
    description: 'Delayed webhooks can desync billing and credits unless lifecycle logic is idempotent.',
    icon: RefreshCw,
  },
  {
    title: 'Compliance evidence is manual',
    description: 'Teams spend hours stitching logs together before every security review.',
    icon: FileCheck,
  },
];

const featureItems = [
  {
    title: 'Approval Inbox',
    description: 'Review and resolve high-risk actions in one operational queue.',
    icon: Inbox,
    size: 'large',
  },
  {
    title: 'Policy Rules Engine',
    description: 'Gate sensitive actions by role, project scope, and risk profile.',
    icon: Gavel,
    size: 'small',
  },
  {
    title: 'Retry-Safe Events',
    description: 'Idempotent processing prevents duplicate grants and subscription drift.',
    icon: RefreshCw,
    size: 'small',
  },
  {
    title: 'Project Isolation',
    description: 'Keep contexts separated without blocking cross-team governance.',
    icon: FolderGit2,
    size: 'small',
  },
  {
    title: 'Complete Audit Trail',
    description: 'Track actor, timestamp, policy reason, and outcome for every decision.',
    icon: History,
    size: 'small',
  },
  {
    title: 'Operational Timeline',
    description: 'See messages, tool calls, approvals, and failures in one stream.',
    icon: Clock,
    size: 'large',
  },
];

const workflowItems = [
  {
    step: '01',
    title: 'Ingest context',
    description: 'Capture prompt, actor, and project metadata at the point of execution.',
  },
  {
    step: '02',
    title: 'Apply policy',
    description: 'Route risky actions into approval while low-risk tasks continue automatically.',
  },
  {
    step: '03',
    title: 'Execute safely',
    description: 'Handle retries, delayed events, and failures without state mismatch.',
  },
  {
    step: '04',
    title: 'Audit instantly',
    description: 'Export verifiable evidence for security, finance, and operations.',
  },
];

const testimonialItems = [
  {
    quote:
      'We cut incident review from 3 hours to 45 minutes because every approval and tool action is already linked.',
    author: 'Head of Platform',
    company: 'Fintech Org',
  },
  {
    quote: 'ControlPlane gave security and product a shared source of truth. Fewer meetings, faster releases.',
    author: 'VP Engineering',
    company: 'SaaS Company',
  },
  {
    quote: 'The retry-safe lifecycle solved our billing drift during webhook delays. That alone paid for rollout.',
    author: 'Staff Engineer',
    company: 'B2B Software Team',
  },
];

const faqItems = [
  {
    question: 'Do we need to replace our current AI stack?',
    answer:
      'No. Most teams start by routing one high-risk workflow through ControlPlane, then expand coverage gradually.',
  },
  {
    question: 'Will this slow down engineering teams?',
    answer: 'Only risky actions require extra approval. Everyday low-risk operations continue at normal speed.',
  },
  {
    question: 'Can this support compliance audits?',
    answer: 'Yes. You can export actor-level evidence with timestamps, decisions, and policy context.',
  },
  {
    question: 'How long does onboarding take?',
    answer: 'Most teams run a guided pilot in days, not months, by integrating one workflow first.',
  },
];

export function LandingSix() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <div className={styles.brandIcon}>
            <Shield className="w-5 h-5" />
          </div>
          ControlPlane
        </Link>
        <nav className={styles.nav}>
          <a href="#features">Features</a>
          <a href="#workflow">Workflow</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className={styles.headerActions}>
          <a className={styles.signIn} href="/sign-in">
            Sign in
          </a>
          <a className={styles.headerCta} href="/sign-up">
            Book demo
          </a>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <span className={styles.betaBadge}>Now Available</span>
            <span className={styles.betaText}>AI operations for teams that cannot afford surprises</span>
          </div>
          <h1 className={styles.title}>
            Infrastructure is not your bottleneck.
            <span className={styles.titleAccent}>Operational clarity is.</span>
          </h1>
          <p className={styles.description}>
            ControlPlane gives engineering, security, and operations one governed system for prompts, approvals,
            execution, and recovery.
          </p>
          <div className={styles.actions}>
            <a className={styles.primaryAction} href="/sign-up">
              Get your architecture walkthrough
              <ArrowRight className="w-4 h-4" />
            </a>
            <a className={styles.secondaryAction} href="/sign-in">
              Access your workspace
            </a>
          </div>
          <div className={styles.trustBar}>
            {trustSignals.map((signal) => (
              <div key={signal} className={styles.trustItem}>
                <CheckCircle2 className="w-4 h-4" />
                <span>{signal}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.dashboardPreview}>
            <div className={styles.previewHeader}>
              <div className={styles.previewDots}>
                <span></span>
                <span></span>
                <span></span>
              </div>
              <div className={styles.previewTitle}>Operations Dashboard</div>
            </div>
            <div className={styles.previewContent}>
              <div className={styles.previewRow}>
                <div className={styles.previewStatus}></div>
                <div className={styles.previewLine} style={{ width: '60%' }}></div>
              </div>
              <div className={styles.previewRow}>
                <div className={styles.previewStatus}></div>
                <div className={styles.previewLine} style={{ width: '80%' }}></div>
              </div>
              <div className={styles.previewRow}>
                <div className={styles.previewStatus}></div>
                <div className={styles.previewLine} style={{ width: '45%' }}></div>
              </div>
            </div>
          </div>
          <div className={styles.floatingCard} style={{ top: '10%', right: '-5%' }}>
            <Activity className="w-4 h-4" />
            <span>Policy Applied</span>
          </div>
          <div className={styles.floatingCard} style={{ bottom: '20%', left: '-10%' }}>
            <Lock className="w-4 h-4" />
            <span>Audit Ready</span>
          </div>
        </div>
      </section>

      <section className={styles.statsSection}>
        <div className={styles.statGrid}>
          {statItems.map((item, i) => (
            <article className={styles.statCard} key={item.label} style={{ animationDelay: `${i * 0.1}s` }}>
              <p className={styles.statValue}>{item.value}</p>
              <span className={styles.statLabel}>{item.label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} id="problems">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Why teams switch</p>
          <h2 className={styles.sectionTitle}>Most AI incidents are workflow design failures, not model failures.</h2>
        </div>
        <div className={styles.problemGrid}>
          {problemItems.map((item, i) => (
            <article className={styles.problemCard} key={item.title} style={{ animationDelay: `${i * 0.1}s` }}>
              <div className={styles.problemIcon}>
                <item.icon className="w-6 h-6" />
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} id="features">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Feature stack</p>
          <h2 className={styles.sectionTitle}>Built to prevent the exact failures teams see in production.</h2>
        </div>
        <div className={styles.bentoGrid}>
          {featureItems.map((item, i) => (
            <article
              className={`${styles.bentoCard} ${item.size === 'large' ? styles.bentoCardLarge : ''}`}
              key={item.title}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className={styles.bentoIcon}>
                <item.icon className="w-5 h-5" />
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} id="workflow">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>How rollout works</p>
          <h2 className={styles.sectionTitle}>Start with one critical workflow. Scale with confidence.</h2>
        </div>
        <div className={styles.workflowList}>
          {workflowItems.map((item, i) => (
            <article className={styles.workflowItem} key={item.title}>
              <div className={styles.workflowNumber}>{item.step}</div>
              <div className={styles.workflowContent}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
              {i < workflowItems.length - 1 && (
                <div className={styles.workflowConnector}>
                  <ChevronRight className="w-5 h-5" />
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Operator proof</p>
          <h2 className={styles.sectionTitle}>What teams report after rollout</h2>
        </div>
        <div className={styles.testimonialGrid}>
          {testimonialItems.map((item, i) => (
            <article className={styles.testimonialCard} key={item.author} style={{ animationDelay: `${i * 0.1}s` }}>
              <Quote className="w-8 h-8" />
              <p className={styles.quote}>{item.quote}</p>
              <div className={styles.testimonialAuthor}>
                <strong>{item.author}</strong>
                <span>{item.company}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div className={styles.ctaContent}>
          <p className={styles.eyebrow}>Next step</p>
          <h2 className={styles.ctaTitle}>Bring one high-risk workflow. Leave with a safer execution plan.</h2>
          <p className={styles.ctaDescription}>
            We map your current flow, identify failure points, and show exactly how ControlPlane closes them.
          </p>
          <div className={styles.ctaActions}>
            <a className={styles.primaryAction} href="/sign-up">
              Book your implementation session
              <ArrowRight className="w-4 h-4" />
            </a>
            <a className={styles.secondaryAction} href="/sign-in">
              Sign in and review current operations
            </a>
          </div>
        </div>
      </section>

      <section className={styles.section} id="faq">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>FAQ</p>
          <h2 className={styles.sectionTitle}>Questions before you commit</h2>
        </div>
        <div className={styles.faqList}>
          {faqItems.map((item) => (
            <details className={styles.faqItem} key={item.question}>
              <summary>
                {item.question}
                <div className={styles.faqIcon}>
                  <span></span>
                  <span></span>
                </div>
              </summary>
              <div className={styles.faqAnswer}>
                <p>{item.answer}</p>
              </div>
            </details>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerBrand}>
            <div className={styles.brandIcon}>
              <Shield className="w-5 h-5" />
            </div>
            <span>ControlPlane</span>
          </div>
          <p className={styles.footerCopy}>© 2026 ControlPlane, Inc. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
