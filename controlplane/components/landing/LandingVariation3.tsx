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
    Activity,
    Eye
} from 'lucide-react';
import styles from './LandingSeven.module.css';

const activityFeed = [
    { time: '14:32:01', status: 'success', action: 'user: sarah@ prompt: "summarize legal docs"', badge: 'LOGGED' },
    { time: '14:31:58', status: 'warning', action: 'user: mike@ tool: "drop_db_table"', badge: 'INTERCEPTED' },
    { time: '14:31:44', status: 'success', action: 'user: alex@ tool: "slack_message"', badge: 'EXECUTED' },
    { time: '14:31:39', status: 'error', action: 'user: guest prompt: "export users"', badge: 'BLOCKED' },
];

const metrics = [
    { value: '100%', label: 'Prompt visibility across org' },
    { value: 'Zero', label: 'Blind spots in AI usage' },
    { value: 'Live', label: 'Streaming operational timeline' },
    { value: 'SOC 2', label: 'Compliant logging by default' },
];

export function LandingVariation3() {
    return (
        <main className={styles.page}>
            <div className={styles.gridBg} aria-hidden />

            {/* ── Header ── */}
            <header className={styles.header}>
                <Link href="/" className={styles.brand}>
                    <div className={styles.brandMark}>
                        <Eye className="w-4 h-4" />
                    </div>
                    ControlPlane
                </Link>
                <nav className={styles.nav}>
                    <a href="#timeline">The Timeline</a>
                    <a href="#control">Control Features</a>
                </nav>
                <div className={styles.headerActions}>
                    <a href="/sign-in" className={styles.signIn}>Sign in</a>
                    <a href="/sign-up" className={styles.bookDemo}>
                        Book Demo <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                </div>
            </header>

            {/* ── Hero (Layout Variation: Large centered hero, no side terminal) ── */}
            <section className="max-w-4xl mx-auto pt-32 pb-20 text-center px-6">
                <p className="inline-flex items-center justify-center px-3 py-1 mb-6 text-sm font-medium rounded-full bg-zinc-100 text-zinc-900 border border-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-800 tracking-wide uppercase">
                    Total Visibility
                </p>
                <h1 className="text-5xl md:text-7xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-6">
                    Stop guessing how your
                    <br className="hidden md:block" />
                    <span className="text-zinc-500 dark:text-zinc-400">company uses AI.</span>
                </h1>
                <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-10 max-w-2xl mx-auto">
                    Deploy an enterprise chatbot where every prompt, tool execution, and policy evaluation is streamed to a centralized, searchable operational timeline.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <a href="/sign-up" className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-white transition-colors bg-zinc-900 rounded-md hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white shadow">
                        Start Free Trial
                    </a>
                    <a href="/docs" className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium transition-colors bg-white border rounded-md border-zinc-200 text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900">
                        View the Dashboard
                    </a>
                </div>
            </section>

            {/* ── Central Terminal Feature (Layout Variation: Full width timeline) ── */}
            <section className="max-w-5xl mx-auto px-6 mb-32" id="timeline">
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black overflow-hidden shadow-2xl">
                    <div className="flex items-center px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                        <div className="flex space-x-2">
                            <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                            <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                            <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                        </div>
                        <div className="mx-auto font-mono text-xs text-zinc-500 flex items-center gap-2">
                            <Activity className="w-3 h-3" /> LIVE ORGANIZATIONAL FEED
                        </div>
                    </div>
                    <div className="p-6 font-mono text-sm leading-relaxed overflow-x-auto">
                        {activityFeed.map((item, i) => (
                            <div key={i} className="flex flex-col sm:flex-row sm:items-center py-2 border-b border-zinc-100 dark:border-zinc-900 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                                <span className="text-zinc-400 w-24 flex-shrink-0">{item.time}</span>
                                <span className={`w-3 h-3 rounded-full mr-4 flex-shrink-0 ${item.status === 'success' ? 'bg-emerald-500' : item.status === 'warning' ? 'bg-amber-500' : item.status === 'error' ? 'bg-red-500' : 'bg-zinc-500'}`} />
                                <span className="flex-grow text-zinc-800 dark:text-zinc-300">{item.action}</span>
                                <span className="mt-2 sm:mt-0 text-[10px] px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 font-bold uppercase tracking-wider text-zinc-500 bg-zinc-100 dark:bg-zinc-900">
                                    {item.badge}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Control Features Grid (Layout Variation: Modern Grid) ── */}
            <section className="max-w-6xl mx-auto px-6 mb-32" id="control">
                <h2 className="text-3xl font-semibold mb-12 text-center text-zinc-900 dark:text-zinc-50">Total Control Infrastructure</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50">
                        <History className="w-8 h-8 mb-6 text-zinc-900 dark:text-white" />
                        <h3 className="text-xl font-medium mb-3 text-zinc-900 dark:text-zinc-50">Global Search</h3>
                        <p className="text-zinc-600 dark:text-zinc-400">Instantly search every prompt ever sent by any employee. Track down data leaks or policy violations in seconds.</p>
                    </div>
                    <div className="p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50">
                        <Shield className="w-8 h-8 mb-6 text-zinc-900 dark:text-white" />
                        <h3 className="text-xl font-medium mb-3 text-zinc-900 dark:text-zinc-50">Kill Switches</h3>
                        <p className="text-zinc-600 dark:text-zinc-400">Instantly revoke tool access for specific users or globally disable specific LLM models during an incident.</p>
                    </div>
                    <div className="p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50">
                        <FileCheck className="w-8 h-8 mb-6 text-zinc-900 dark:text-white" />
                        <h3 className="text-xl font-medium mb-3 text-zinc-900 dark:text-zinc-50">Exportable Proof</h3>
                        <p className="text-zinc-600 dark:text-zinc-400">Generate CSV or JSON reports of all AI interactions mapped to specific employees for your next compliance audit.</p>
                    </div>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className={styles.footer}>
                <div className={styles.footerInner}>
                    <div className={styles.footerBrand}>
                        <div className={styles.brandMark}>
                            <Eye className="w-4 h-4" />
                        </div>
                        <span>ControlPlane</span>
                    </div>
                    <p>© 2026 ControlPlane, Inc. All rights reserved.</p>
                </div>
            </footer>
        </main>
    );
}
