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
    { time: '14:32:01', status: 'success', action: 'chat    summarize_docs', badge: 'AUTO' },
    { time: '14:31:58', status: 'warning', action: 'tool    update_billing', badge: 'APPROVAL REQUIRED' },
    { time: '14:31:44', status: 'dim', action: 'chat    draft_response', badge: 'AUTO' },
    { time: '14:31:39', status: 'error', action: 'tool    drop_table', badge: 'BLOCKED BY POLICY' },
    { time: '14:31:22', status: 'success', action: 'tool    issue_refund', badge: 'APPROVED IN SLACK' },
    { time: '14:31:11', status: 'dim', action: 'chat    query_knowledge', badge: 'AUTO' },
];

const metrics = [
    { value: '10x', label: 'Faster employee operations' },
    { value: '0', label: 'Unauthorized database writes' },
    { value: 'Slack', label: 'Integration for quick approvals' },
    { value: 'Custom', label: 'Tools connected to your chat' },
    { value: '100%', label: 'Visibility into tool usage' },
    { value: 'Human', label: 'In the loop when it counts' },
];

const problemItems = [
    {
        title: 'Chatbots are disconnected',
        description: 'Current AI tools can write an email, but they can\'t actually push the button to send it or update Salesforce.',
        icon: GitBranch,
    },
    {
        title: 'Autonomy is terrifying',
        description: 'Giving an LLM direct access to write to your production database is a recipe for disaster. No one trusts it yet.',
        icon: RefreshCw,
    },
    {
        title: 'Approvals are siloed',
        description: 'When an employee needs permission to act, the request gets buried in a Jira ticket. Innovation grinds to a halt.',
        icon: FileCheck,
    },
];

const featureItems = [
    {
        title: 'The Approval Inbox',
        description:
            'Route high-risk AI requests straight to management. Users ask to execute a tool, managers click Approve in Slack.',
        icon: Inbox,
        span: 2,
    },
    {
        title: 'Chat with your APIs',
        description: 'Plug in any internal tool. Your employees can now converse with your backend systems naturally.',
        icon: FolderGit2,
        span: 1,
    },
    {
        title: 'Policy-Driven Pauses',
        description: 'Define exact conditions that mandate a human check before an API call is fired.',
        icon: Shield,
        span: 1,
    },
    {
        title: 'Unified Operational Trace',
        description: 'See the conversation leading up to the request, the approval, and the execution result in one timeline.',
        icon: Clock,
        span: 1,
    },
    {
        title: 'Idempotent Retries',
        description: 'If an approved action times out, our engine ensures it isn\'t executed twice by mistake.',
        icon: RefreshCw,
        span: 1,
    },
    {
        title: 'Granular Role Definitions',
        description:
            'Support agents get access to Zendesk tools. Engineers get AWS tools. Everyone operates securely from the same interface.',
        icon: Gavel,
        span: 2,
    },
];

const workflowItems = [
    {
        step: '01',
        title: 'User prompts the chatbot',
        description: '"Refund $50 to customer ID 12345 due to service outage."',
    },
    {
        step: '02',
        title: 'Policy engine intercepts',
        description: 'ControlPlane detects a high-risk tool call (issue_refund). It pauses execution and alerts the manager.',
    },
    {
        step: '03',
        title: 'Human approves in Slack',
        description: 'The manager sees the context and approves the refund with a single click in their Slack channel.',
    },
    {
        step: '04',
        title: 'Tool executes automatically',
        description: 'The AI immediately processes the refund and confirms success back to the user in the chat interface.',
    },
];

const testimonialItems = [
    {
        quote:
            'We wanted to give our support team AI tools, but couldn\'t trust it to make mutations. The Slack approval flow solved this overnight.',
        author: 'Head of Support Operations',
        company: 'SaaS Platform',
    },
    {
        quote: 'Our engineers can now query production logs through chat naturally, but any disruptive commands are strictly gated.',
        author: 'VP of Engineering',
        company: 'Fintech Startup',
    },
    {
        quote: 'It’s the perfect balance. We get the speed of AI with the sanity check of a human being.',
        author: 'Director of Product',
        company: 'Logistics Network',
    },
];

const faqItems = [
    {
        question: 'How do you define a "high risk" action?',
        description:
            'You tell us. In your admin dashboard, you can define policies that flag specific tools (e.g., delete_user) as requiring manual approval.',
    },
    {
        question: 'Does the user have to wait in the chat?',
        description: 'The chat interface indicates the request is pending. They can continue chatting or working while waiting for the manager to approve.',
    },
    {
        question: 'Can we use this for read-only actions?',
        description: 'Absolutely. Many customers allow free access to read-tools (like looking up an order) but flag write-tools for approval.',
    },
    {
        question: 'What if an approver is on vacation?',
        description: 'You can configure fallback approvers, group-based approvals (e.g., @engineering-leads), or automated escalation paths.',
    },
];

export function LandingVariation2() {
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
                        Start for Free <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                </div>
            </header>

            {/* ── Hero ── */}
            <section className={styles.hero}>
                <div className={styles.heroText}>
                    <p className={styles.eyebrow}>Governed AI Workflows</p>
                    <h1 className={styles.headline}>
                        Chat with data.
                        <br />
                        <em>Execute with permission.</em>
                    </h1>
                    <p className={styles.subline}>
                        Empower your team with an internal chatbot that connects to your tools. When high-risk actions are requested, automatically pause and ping a human for approval.
                    </p>
                    <div className={styles.heroActions}>
                        <a href="/sign-up" className={styles.primaryCta}>
                            Create your Workspace
                            <ArrowRight className="w-4 h-4" />
                        </a>
                        <a href="/docs" className={styles.secondaryCta}>
                            See the Workflow
                        </a>
                    </div>
                    <div className={styles.trustPills}>
                        {['Slack Integration', 'Human-in-the-loop', 'Custom Tool Hookups', 'Automated Pausing'].map((t) => (
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
                            CHAT EXECUTION PIPELINE
                        </span>
                        <span className={styles.terminalPolicies}>Approval gating active</span>
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
                                    className={`${styles.feedBadge} ${item.badge === 'APPROVED IN SLACK' || item.badge === 'AUTO'
                                            ? styles.badgeApproved
                                            : item.badge === 'APPROVAL REQUIRED'
                                                ? styles.badgePending
                                                : item.badge === 'BLOCKED BY POLICY'
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
                <p className={styles.sectionEyebrow}>The Automation Dilemma</p>
                <h2 className={styles.sectionTitle}>
                    Read-only chat is boring.
                    <br />
                    Full autonomy is dangerous.
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
                <p className={styles.sectionEyebrow}>The Best of Both Worlds</p>
                <h2 className={styles.sectionTitle}>
                    Unlock powerful tools with
                    <br />
                    guaranteed oversight.
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
                <p className={styles.sectionEyebrow}>Action in Motion</p>
                <h2 className={styles.sectionTitle}>
                    From prompt to production,
                    <br />
                    safely.
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
                <h2 className={styles.sectionTitle}>Teams using human-in-the-loop workflows</h2>
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
                <p className={styles.ctaEyebrow}>Level up your team</p>
                <h2 className={styles.ctaTitle}>
                    Connect your tools.
                    <br />
                    Start executing safely.
                </h2>
                <p className={styles.ctaSubline}>
                    Deploy a governed chatbot that your team will actually use, with guardrails your manager will approve.
                </p>
                <div className={styles.ctaActions}>
                    <a href="/sign-up" className={styles.primaryCta}>
                        Get Started
                        <ArrowRight className="w-4 h-4" />
                    </a>
                    <a href="/docs" className={styles.secondaryCta}>
                        Review Documentation
                    </a>
                </div>
            </section>

            {/* ── FAQ ── */}
            <section className={styles.section} id="faq">
                <p className={styles.sectionEyebrow}>FAQ</p>
                <h2 className={styles.sectionTitle}>Questions about workflows</h2>
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
