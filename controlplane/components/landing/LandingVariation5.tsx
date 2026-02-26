'use client';

import Link from 'next/link';
import {
    Skull,
    Lock,
    Zap,
    CheckCircle2,
    AlertTriangle
} from 'lucide-react';
import styles from './LandingSeven.module.css';

export function LandingVariation5() {
    return (
        <main className="min-h-screen bg-black text-zinc-200 selection:bg-red-500/30 font-sans">
            {/* ── Minimalist Aggressive Header ── */}
            <header className="flex justify-between items-center p-6 lg:p-10 border-b border-zinc-900">
                <Link href="/" className="flex items-center gap-3 font-bold text-xl tracking-tight text-white hover:text-red-500 transition-colors">
                    <Lock className="w-6 h-6 text-red-500" />
                    CONTROLPLANE
                </Link>
                <a href="/sign-up" className="px-5 py-2.5 text-sm font-bold text-black uppercase tracking-wider bg-white hover:bg-zinc-200 transition-colors">
                    Take Back Control
                </a>
            </header>

            {/* ── High Contrast Hero ── */}
            <section className="max-w-5xl mx-auto px-6 pt-24 lg:pt-40 pb-20">
                <div className="inline-flex items-center gap-2 px-3 py-1 mb-8 text-xs font-bold text-red-500 uppercase tracking-widest border border-red-500/30 bg-red-500/10">
                    <AlertTriangle className="w-4 h-4" /> Stop the Bleeding
                </div>

                <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-white mb-8 leading-[0.9]">
                    Shadow AI is a liability.<br />
                    <span className="text-zinc-600">Give them an alternative.</span>
                </h1>

                <p className="text-xl md:text-2xl font-medium text-zinc-400 max-w-3xl mb-12 leading-relaxed">
                    Your employees are pasting proprietary code and customer data into public chatbots right now. Blanket bans fail. Deploy a secure, governed internal chatbot they will actually want to use.
                </p>

                <div className="flex flex-col sm:flex-row items-start gap-6">
                    <a href="/sign-up" className="px-8 py-4 text-lg font-bold text-black uppercase tracking-widest bg-red-500 hover:bg-red-600 transition-all active:scale-95 shadow-[0_0_40px_rgba(239,68,68,0.4)]">
                        Deploy Secure Chat
                    </a>
                    <a href="/docs" className="px-8 py-4 text-lg font-bold text-white uppercase tracking-widest border-2 border-zinc-800 hover:border-zinc-600 transition-all active:scale-95">
                        Read Security Spec
                    </a>
                </div>
            </section>

            {/* ── Brutalist Feature List ── */}
            <section className="bg-zinc-950 border-y border-zinc-900 py-24">
                <div className="max-w-5xl mx-auto px-6">
                    <h2 className="text-4xl font-black text-white uppercase tracking-tight mb-16 border-b border-zinc-800 pb-8">
                        The Arsenal
                    </h2>

                    <div className="grid md:grid-cols-2 gap-x-12 gap-y-16">

                        <div>
                            <div className="flex items-center gap-4 mb-4">
                                <Skull className="w-8 h-8 text-red-500" />
                                <h3 className="text-2xl font-bold text-white">Kill External Leaks</h3>
                            </div>
                            <p className="text-lg text-zinc-500">
                                Replace unmonitored browser tabs with an enterprise-grade interface. Keep every prompt, answer, and uploaded document inside your VPC.
                            </p>
                        </div>

                        <div>
                            <div className="flex items-center gap-4 mb-4">
                                <Zap className="w-8 h-8 text-red-500" />
                                <h3 className="text-2xl font-bold text-white">Action without Chaos</h3>
                            </div>
                            <p className="text-lg text-zinc-500">
                                Don't just give them a text box. Connect your internal APIs so the bot can execute tasks—while a strict hardcoded policy engine prevents any unauthorized actions.
                            </p>
                        </div>

                        <div>
                            <div className="flex items-center gap-4 mb-4">
                                <CheckCircle2 className="w-8 h-8 text-red-500" />
                                <h3 className="text-2xl font-bold text-white">Zero Trust Approvals</h3>
                            </div>
                            <p className="text-lg text-zinc-500">
                                If an employee asks the AI to delete a record or spend money, the request instantly pauses and drops a notification in Slack for manager approval.
                            </p>
                        </div>

                        <div>
                            <div className="flex items-center gap-4 mb-4">
                                <Lock className="w-8 h-8 text-red-500" />
                                <h3 className="text-2xl font-bold text-white">Indisputable Audits</h3>
                            </div>
                            <p className="text-lg text-zinc-500">
                                Every API call the AI makes is logged immutably against the Azure AD / Okta identity of the employee who authorized it. Hand that to your auditors.
                            </p>
                        </div>

                    </div>
                </div>
            </section>

            <footer className="py-12 text-center text-zinc-600 font-bold tracking-widest uppercase text-xs">
                © 2026 ControlPlane Corporation
            </footer>
        </main>
    );
}
