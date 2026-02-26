'use client';

import Link from 'next/link';
import {
    Code2,
    Terminal,
    Database,
    Webhook,
    ArrowRight,
    Blocks,
    Puzzle
} from 'lucide-react';
import styles from './LandingSeven.module.css';

const apiHookCode = `
import { ControlPlane } from '@controlplane/sdk';

// 1. Define your internal HR tool
const updateSalaryTool = {
  name: "update_salary",
  description: "Updates an employee's salary in Workday",
  execute: async ({ employeeId, amount }) => {
    return workdayApi.update(employeeId, { salary: amount });
  }
};

// 2. Wrap it with the governance engine
const governedTool = ControlPlane.protect(updateSalaryTool, {
  requiresApproval: true,
  approverRole: "HR_DIRECTOR",
  auditLevel: "STRICT"
});

// 3. Connect to the Chat UI
bot.registerTool(governedTool);
`;

export function LandingVariation4() {
    return (
        <main className={`${styles.page} bg-zinc-50 dark:bg-zinc-950`}>
            {/* ── Header ── */}
            <header className={`${styles.header} border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-black/50 backdrop-blur-md`}>
                <Link href="/" className={styles.brand}>
                    <div className="flex items-center justify-center w-6 h-6 rounded bg-indigo-600 text-white mr-2">
                        <Blocks className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-semibold">ControlPlane <span className="text-indigo-600 dark:text-indigo-400">Platform</span></span>
                </Link>
                <div className={styles.headerActions}>
                    <a href="/docs" className="text-sm font-medium hover:text-indigo-600 mr-6 transition-colors">Documentation</a>
                    <a href="/sign-up" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                        Start Building
                    </a>
                </div>
            </header>

            {/* ── Split Hero (Layout Variation: Left text, Right Code block) ── */}
            <section className="max-w-7xl mx-auto px-6 pt-24 pb-20 lg:pt-32 lg:flex lg:items-center lg:gap-16">
                <div className="max-w-2xl lg:w-1/2 mb-16 lg:mb-0">
                    <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-full dark:bg-indigo-900/50 dark:text-indigo-300">
                        <Terminal className="w-4 h-4" /> For Platform Teams
                    </div>
                    <h1 className="text-5xl lg:text-6xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-6 leading-tight">
                        Bring your own tools.<br />
                        We bring the guardrails.
                    </h1>
                    <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-10 leading-relaxed">
                        Stop building custom chat interfaces from scratch. Connect your internal APIs to our governed chatbot platform in minutes. You handle the business logic, we handle the RBAC, approvals, and audit logging.
                    </p>
                    <div className="flex items-center gap-4">
                        <a href="/sign-up" className="px-6 py-3 text-base font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/20">
                            Get API Keys
                        </a>
                        <a href="/docs" className="px-6 py-3 text-base font-medium text-zinc-900 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-800 transition-colors shadow-sm">
                            Read SDK Docs
                        </a>
                    </div>
                </div>

                {/* Code Visual */}
                <div className="lg:w-1/2">
                    <div className="rounded-xl overflow-hidden shadow-2xl bg-[#1E1E1E] border border-zinc-800">
                        <div className="flex items-center px-4 py-3 bg-[#2D2D2D] border-b border-[#404040]">
                            <div className="flex space-x-2">
                                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                            </div>
                            <span className="ml-4 text-xs font-mono text-zinc-400">server/chatbot-config.ts</span>
                        </div>
                        <div className="p-6 overflow-x-auto">
                            <pre className="text-sm font-mono text-[#D4D4D4] leading-relaxed basis-full">
                                <code>
                                    <span className="text-[#C586C0]">import</span> {'{ '}ControlPlane{' }'} <span className="text-[#C586C0]">from</span> <span className="text-[#CE9178]">'@controlplane/sdk'</span>;<br /><br />
                                    <span className="text-[#6A9955]">// 1. Define your internal tool</span><br />
                                    <span className="text-[#569CD6]">const</span> <span className="text-[#4FC1FF]">updateDatabase</span> = {'{'} <br />
                                    {'  '}name: <span className="text-[#CE9178]">"update_records"</span>,<br />
                                    {'  '}execute: <span className="text-[#569CD6]">async</span> (args) =&gt; {'{'} ... {'}'}<br />
                                    {'}'};<br /><br />
                                    <span className="text-[#6A9955]">// 2. Wrap it with the governance engine</span><br />
                                    <span className="text-[#569CD6]">const</span> <span className="text-[#4FC1FF]">governedTool</span> = ControlPlane.protect(updateDatabase, {'{'}<br />
                                    {'  '}requiresApproval: <span className="text-[#569CD6]">true</span>,<br />
                                    {'  '}approverRole: <span className="text-[#CE9178]">"ENGINEERING_LEAD"</span>,<br />
                                    {'  '}auditLevel: <span className="text-[#CE9178]">"STRICT"</span><br />
                                    {'}'});<br /><br />
                                    <span className="text-[#6A9955]">// 3. Deploy instantly to the Chat UI</span><br />
                                    bot.register(governedTool);
                                </code>
                            </pre>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Developer Features (Layout Variation: Alternating side-by-side) ── */}
            <section className="max-w-7xl mx-auto px-6 py-20">
                <div className="grid md:grid-cols-3 gap-12">

                    <div className="flex gap-4">
                        <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
                            <Code2 className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold mb-2 text-zinc-900 dark:text-zinc-50">SDK First</h3>
                            <p className="text-zinc-600 dark:text-zinc-400">Typed SDKs for TypeScript, Python, and Go. Wrap any async function and instantly turn it into a governed tool available in chat.</p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
                            <Webhook className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold mb-2 text-zinc-900 dark:text-zinc-50">Webhooks & Event Stream</h3>
                            <p className="text-zinc-600 dark:text-zinc-400">Listen for chat events, tool approvals, and policy evaluations in real-time to trigger downstream operational workflows.</p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400">
                            <Database className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold mb-2 text-zinc-900 dark:text-zinc-50">BYO Models</h3>
                            <p className="text-zinc-600 dark:text-zinc-400">Connect your own OpenAI, Anthropic, or fine-tuned local models. We provide the chat interface and the policy layer.</p>
                        </div>
                    </div>

                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="border-t border-zinc-200 dark:border-zinc-800 py-12 mt-20">
                <div className="max-w-7xl mx-auto px-6 flex justify-between items-center text-sm text-zinc-500">
                    <div className="flex items-center gap-2 font-semibold">
                        <Blocks className="w-4 h-4" /> ControlPlane Platform
                    </div>
                    <p>© 2026</p>
                </div>
            </footer>
        </main>
    );
}
