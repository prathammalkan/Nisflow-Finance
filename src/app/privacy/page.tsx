import Link from 'next/link';
import { ArrowLeft, Shield, Lock, Eye, Server, Cpu, Database, Trash2, Mail } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy',
  description: 'NisFlow Finance Privacy Policy and Data Handling Practices',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation Header */}
      <header className="border-b border-border/60 bg-background/95 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to NisFlow</span>
          </Link>
          <div className="font-semibold tracking-tight text-sm">
            NisFlow Finance
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-12">
        {/* Title */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
            <Shield className="h-3.5 w-3.5" />
            <span>Privacy & Transparency</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-display">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground">
            Effective Date: September 11, 2026 • Version 1.0
          </p>
        </div>

        {/* Executive Summary */}
        <section className="rounded-xl border border-border/80 bg-card p-6 space-y-3">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            Our Core Privacy Philosophy
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            NisFlow Finance is built to bring clarity and control to your personal finances.
            We believe your financial records belong strictly to you. We do not sell your personal
            data or monetize transaction histories with advertisers. This document accurately outlines
            what information we collect, how it is processed and stored, the role of our third-party
            infrastructure providers, and your absolute right to export or permanently delete your records at any time.
          </p>
        </section>

        {/* Section 1: Information Collected */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            1. Information We Collect
          </h2>
          <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
            <p>
              We collect information that you directly provide when using NisFlow Finance:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
                <h3 className="font-semibold text-foreground flex items-center gap-1.5">
                  <Lock className="h-4 w-4 text-primary" /> Account & Identity Information
                </h3>
                <p className="text-xs">
                  Your email address, authentication credentials managed through Supabase Auth, and optional profile display name.
                </p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
                <h3 className="font-semibold text-foreground flex items-center gap-1.5">
                  <Database className="h-4 w-4 text-primary" /> Financial Records
                </h3>
                <p className="text-xs">
                  Accounts, balances, transactions, categorization labels, double-entry ledger entries, counterparties, loan schedules, investments, savings targets, and tax inputs you record.
                </p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
                <h3 className="font-semibold text-foreground flex items-center gap-1.5">
                  <Server className="h-4 w-4 text-primary" /> Uploaded Documents
                </h3>
                <p className="text-xs">
                  Invoices, statements, and receipts you optionally upload to document transactions or monthly closings.
                </p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
                <h3 className="font-semibold text-foreground flex items-center gap-1.5">
                  <Cpu className="h-4 w-4 text-primary" /> Technical & Device Data
                </h3>
                <p className="text-xs">
                  IP addresses (used strictly for rate limiting and fraud defense), device notification subscription endpoints, and local hardware biometric registration flags.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: How Data is Used */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            2. How We Use Your Information
          </h2>
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground leading-relaxed pl-1">
            <li>To provide, maintain, and calculate your financial accounts, net worth, and double-entry accounting ledgers.</li>
            <li>To calculate loan amortization schedules, savings progress, and estimated income tax comparisons.</li>
            <li>To process your natural language financial queries and transaction categorization requests using AI assistance.</li>
            <li>To enforce rate limiting, prevent unauthorized cross-tenant data access, and safeguard system security.</li>
            <li>To send opted-in browser and device push alerts regarding due payables, budget thresholds, or account activity.</li>
          </ul>
        </section>

        {/* Section 3: AI & Google Gemini Integration */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary" />
            3. Artificial Intelligence & Automated Processing
          </h2>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-3 text-sm text-muted-foreground leading-relaxed">
            <p>
              NisFlow incorporates Google Gemini models to power automated transaction categorization, spending insights, and companion chat.
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-xs pl-1">
              <li>When you submit a prompt to the AI Companion or request transaction categorization, the relevant text and necessary financial context are transmitted securely via API to Google&apos;s generative AI services.</li>
              <li>Under standard enterprise API agreements with Google Cloud, API inputs are processed to generate completions and are not utilized to train foundation models without explicit consent.</li>
              <li>AI responses are advisory only: NisFlow never permits automated models to mutate or delete your financial ledgers without your explicit confirmation.</li>
            </ul>
          </div>
        </section>

        {/* Section 4: Infrastructure & Third-Party Service Providers */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            4. Infrastructure & Third-Party Services
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We rely on specialized cloud infrastructure providers to operate NisFlow Finance securely:
          </p>
          <div className="space-y-3 text-sm">
            <div className="border rounded-lg p-4 bg-muted/20">
              <span className="font-semibold text-foreground">Supabase (PostgreSQL, Storage, Auth)</span>
              <p className="text-xs text-muted-foreground mt-1">
                Hosts our database with Row Level Security (RLS) enforcing strict multi-tenant isolation, encrypted user authentication sessions, and private document storage.
              </p>
            </div>
            <div className="border rounded-lg p-4 bg-muted/20">
              <span className="font-semibold text-foreground">Google Gemini API</span>
              <p className="text-xs text-muted-foreground mt-1">
                Processes user-initiated natural language chat, intelligent categorization, and financial analysis.
              </p>
            </div>
            <div className="border rounded-lg p-4 bg-muted/20">
              <span className="font-semibold text-foreground">Upstash Redis</span>
              <p className="text-xs text-muted-foreground mt-1">
                Used strictly for distributed rate limiting, denial-of-service prevention, and transient idempotency verification.
              </p>
            </div>
          </div>
        </section>

        {/* Section 5: Cookies and Local Storage */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            5. Cookies & Local Browser Storage
          </h2>
          <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
            <p>
              NisFlow Finance uses essential cookies and browser LocalStorage strictly for functional purposes:
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs pl-1">
              <li><strong>Session Cookies:</strong> Maintained securely by Supabase SSR to authenticate your user session.</li>
              <li><strong>Theme Preferences:</strong> Stored locally to remember your Dark, Light, or System appearance selection.</li>
              <li><strong>Biometric Lock Credentials:</strong> WebAuthn hardware device credentials stored in your device secure enclave to provide Face ID / Touch ID screen protection.</li>
              <li><strong>Analytics/Tracking:</strong> We do not use third-party behavioral advertising trackers or cross-site tracking cookies.</li>
            </ul>
          </div>
        </section>

        {/* Section 6: Data Retention and Deletion */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            6. Data Retention, Export, and Account Deletion
          </h2>
          <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
            <p>
              You maintain full sovereignty over your information:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-xs pl-1">
              <li><strong>Data Export:</strong> You may at any time download complete, portable offline dumps of your entire financial database in structured JSON or executable PostgreSQL SQL formats directly from the Settings page.</li>
              <li><strong>Data Reset:</strong> You can reset all financial ledger records while preserving your authentication login.</li>
              <li><strong>Permanent Account Deletion:</strong> You can permanently delete your NisFlow account directly in <em>Settings &gt; Danger Zone &gt; Delete Account</em>. When initiated with typed confirmation, our system executes an atomic purge across all 35 database tables, deletes document storage files, and permanently removes your Supabase authentication record.</li>
            </ul>
          </div>
        </section>

        {/* Section 7: Security Practices */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            7. Data Security Practices
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We implement defense-in-depth security measures to protect your information:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground leading-relaxed pl-1">
            <li>HTTPS / TLS encryption for all data in transit across public networks.</li>
            <li>PostgreSQL Row Level Security (RLS) enforcing strict per-user tenant isolation on every financial table.</li>
            <li>Constant-time cryptographic comparisons on sensitive verification routes.</li>
            <li>Zero client-side exposure of database administrative secret keys.</li>
            <li>Content Security Policy (CSP), anti-framing protections, and strict security headers.</li>
          </ul>
          <p className="text-xs text-muted-foreground italic mt-2">
            Please note: While we implement rigorous technical safeguards, no internet-connected transmission or software application can guarantee absolute immunity from security risks.
          </p>
        </section>

        {/* Section 8: Contact Information */}
        <section className="rounded-xl border border-border/80 bg-card p-6 space-y-3">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            8. Contact & Privacy Inquiries
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            If you have questions regarding this Privacy Policy, your personal data, or wish to exercise your privacy rights, please reach out to our team:
          </p>
          <div className="text-xs text-foreground font-mono bg-muted/40 p-2.5 rounded-lg inline-block border">
            support@nisflow.finance
          </div>
        </section>

        {/* Footer Link */}
        <div className="border-t border-border/60 pt-6 flex justify-between items-center text-xs text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} NisFlow Finance. All rights reserved.</span>
          <Link href="/terms" className="hover:text-foreground underline">
            Terms & Conditions
          </Link>
        </div>
      </main>
    </div>
  );
}
