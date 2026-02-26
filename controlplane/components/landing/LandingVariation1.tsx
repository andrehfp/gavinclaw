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
    { time: '14:32:01', status: 'success', action: 'chat    generate_report', badge: 'APPROVED' },
    { time: '14:31:58', status: 'warning', action: 'tool    db_query_users', badge: 'PENDING' },
    { time: '14:31:44', status: 'dim', action: 'chat    summarize_ticket', badge: 'AUTO' },
    { time: '14:31:39', status: 'error', action: 'tool    delete_record', badge: 'BLOCKED' },
    { time: '14:31:22', status: 'success', action: 'tool    issue_refund', badge: 'APPROVED' },
    { time: '14:31:11', status: 'dim', action: 'chat    draft_email', badge: 'AUTO' },
];

const metrics = [
    { value: '100%', label: 'Immutable audit logs per user' },
    { value: 'SOC 2', label: 'Compliance out of the box' },
    { value: 'Zero', label: 'Unsanctioned AI operations' },
    { value: 'SSO', label: 'Enforced identity management' },
    { value: 'RBAC', label: 'Granular access to tools' },
    { value: 'Real', label: 'Time policy enforcement' },
];

const problemItems = [
    {
        title: 'Shadow AI threats',
        description: 'Employees are pasting sensitive company data into ungoverned public chatbots. You have no visibility into what leaves the network.',
        icon: GitBranch,
    },
    {
        title: 'Compliance nightmares',
        description: 'When an auditor asks what AI tools your team used last quarter, you can\'t give them an answer, let alone an audit trail.',
        icon: RefreshCw,
    },
    {
        title: 'Blanket bans don\'t work',
        description: 'Blocking ChatGPT just pushes employees to use it on their phones. You need to provide a secure, governed alternative.',
        icon: FileCheck,
    },
];

const featureItems = [
    {
        title: 'Cryptographically Verified Logs',
        description:
            'Every chat message, uploaded file, and executed tool is immutably recorded for undeniable proof of compliance.',
        icon: History,
        span: 2,
    },
    {
        title: 'Zero Trust Execution',
        description: 'Before the chatbot runs any connected internal tool, it checks the user\'s RBAC permissions in real time.',
        icon: Shield,
        span: 1,
    },
    {
        title: 'Approval Workflows',
        description: 'If a user asks the chatbot to perform a high-risk action (like updating a database), require a manager\'s approval.',
        icon: Inbox,
        span: 1,
    },
    {
        title: 'Data Loss Prevention',
        description: 'Inspect chat prompts and block sensitive data exfiltration before it reaches the external LLM provider.',
        icon: FileCheck,
        span: 1,
    },
    {
        title: 'Unified Corporate Identity',
        description: 'Enforce SSO across your entire AI rollout. Tie every single generation back to an authenticated employee.',
        icon: FolderGit2,
        span: 1,
    },
    {
        title: 'Centralized Policy Engine',
        description:
            'Write policies like "Only Support can use the Refund tool" and deploy them globally to all chat sessions instantly.',
        icon: Clock,
        span: 2,
    },
];

const workflowItems = [
    {
        step: '01',
        title: 'Connect your identity provider',
        description: 'Sync your Okta or Azure AD to ensure only authenticated employees access the platform.',
    },
    {
        step: '02',
        title: 'Define strict access policies',
        description: 'Create rules dictating which roles can chat, what models they use, and what internal tools they can trigger.',
    },
    {
        step: '03',
        title: 'Roll out the secure workspace',
        description: 'Employees get a powerful chatbot experience. You get total control over the data flowing through it.',
    },
    {
        step: '04',
        title: 'Export compliance reports',
        description: 'Instantly generate SOC 2 and GDPR reports proving strict access control and auditing for all AI operations.',
    },
];

const testimonialItems = [
    {
        quote:
            'We couldn’t pass our infosec review to roll out ChatGPT. ControlPlane gave us the governance layer we needed to say yes.',
        author: 'Chief Information Security Officer',
        company: 'Global Bank',
    },
    {
        quote: 'It gives us the usability of a consumer chatbot with the hard enforcement of an enterprise firewall.',
        author: 'VP of Security',
        company: 'Enterprise Healthcare',
    },
    {
        quote: 'The ability to prove exactly who asked the AI to perform which action saved us during our last external audit.',
        author: 'Director of Compliance',
        company: 'Public Tech Co.',
    },
];

const faqItems = [
    {
        question: 'Does this keep our data private?',
        description:
            'Yes. ControlPlane offers strict data residency controls, avoids logging PII by default, and supports zero-retention agreements with LLM providers.',
    },
    {
        question: 'How do we control what the AI can do?',
        description: 'You connect custom tools (APIs) and wrap them in our policy engine. The AI can only use tools the user is explicitly authorized for.',
    },
    {
        question: 'How does it integrate with Splunk/Datadog?',
        description: 'We provide native webhook and streaming log integrations to pipe all audit events directly into your SIEM.',
    },
    {
        question: 'Can managers approve actions via Slack?',
        description: 'Yes. If a governed tool is triggered in the chat, the request pauses and pings the required approver in Slack or Teams before executing.',
    },
];

export function LandingVariation1() {
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
                        Contact Sales <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                </div>
            </header>

            {/* ── Hero ── */}
            <section className={styles.hero}>
                <div className={styles.heroText}>
                    <p className={styles.eyebrow}>Enterprise AI Chat</p>
                    <h1 className={styles.headline}>
                        The only AI chatbot your
                        <br />
                        <em>InfoSec team will approve.</em>
                    </h1>
                    <p className={styles.subline}>
                        Give your employees a powerhouse AI assistant built on a zero-trust governance layer. Complete auditing, policy enforcement, and RBAC out of the box.
                    </p>
                    <div className={styles.heroActions}>
                        <a href="/sign-up" className={styles.primaryCta}>
                            Request a Demo
                            <ArrowRight className="w-4 h-4" />
                        </a>
                        <a href="/docs" className={styles.secondaryCta}>
                            Read the Security Whitepaper
                        </a>
                    </div>
                    <div className={styles.trustPills}>
                        {['SOC 2 Type II', 'SSO/SAML Integration', 'Role-Based Access', 'SIEM Export'].map((t) => (
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
                            SECURITY AUDIT LOG
                        </span>
                        <span className={styles.terminalPolicies}>Strict enforcement active</span>
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
                                    className={`${styles.feedDot} ${item.status === 'success'
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
                                    className={`${styles.feedBadge} ${item.badge === 'APPROVED'
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
                <p className={styles.sectionEyebrow}>The Security Gap</p>
                <h2 className={styles.sectionTitle}>
                    Your employees are using AI.
                    <br />
                    You just can't see it.
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
                <p className={styles.sectionEyebrow}>Enterprise capabilities</p>
                <h2 className={styles.sectionTitle}>
                    Comprehensive governance for
                    <br />
                    your internal AI workspace.
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
                <p className={styles.sectionEyebrow}>Enterprise Rollout</p>
                <h2 className={styles.sectionTitle}>
                    Provide the tools they want.
                    <br />
                    Keep the control you need.
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
                <p className={styles.sectionEyebrow}>Trusted by Leaders</p>
                <h2 className={styles.sectionTitle}>Securing the world's most sensitive AI deployments</h2>
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
                <p className={styles.ctaEyebrow}>Take control</p>
                <h2 className={styles.ctaTitle}>
                    Lock down your AI agents.
                    <br />
                    Protect your enterprise data.
                </h2>
                <p className={styles.ctaSubline}>
                    Schedule a technical deep dive with our security engineering team to see ControlPlane in action.
                </p>
                <div className={styles.ctaActions}>
                    <a href="/sign-up" className={styles.primaryCta}>
                        Contact Sales
                        <ArrowRight className="w-4 h-4" />
                    </a>
                    <a href="/docs" className={styles.secondaryCta}>
                        Read the Security Whitepaper
                    </a>
                </div>
            </section>

            {/* ── FAQ ── */}
            <section className={styles.section} id="faq">
                <p className={styles.sectionEyebrow}>FAQ</p>
                <h2 className={styles.sectionTitle}>Common questions for security teams</h2>
                <div className={styles.faqList}>
                    {faqItems.map((item) => (
                        <details key={item.question} className={styles.faqItem}>
                            <summary>{item.question}</summary>
                            <p>{item.description}</p>
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
