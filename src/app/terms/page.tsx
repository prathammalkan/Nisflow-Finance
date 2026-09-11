import Link from 'next/link';
import { ArrowLeft, FileText, AlertTriangle, Scale, Shield, CheckCircle, Mail } from 'lucide-react';

export const metadata = {
  title: 'Terms & Conditions',
  description: 'NisFlow Finance Terms of Service and Conditions of Use',
};

export default function TermsPage() {
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
            <Scale className="h-3.5 w-3.5" />
            <span>Legal Agreement</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-display">
            Terms & Conditions
          </h1>
          <p className="text-sm text-muted-foreground">
            Effective Date: September 11, 2026 • Version 1.0
          </p>
        </div>

        {/* Prominent Financial Disclaimer Banner */}
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 space-y-3">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>IMPORTANT FINANCIAL & REGULATORY DISCLAIMER</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            NisFlow Finance is a personal software tool designed solely for record-keeping,
            double-entry ledger organization, and analytical tracking. NisFlow Finance is{' '}
            <strong>NOT</strong> a registered financial advisor, chartered accountant, banking
            institution, or investment intermediary. Nothing within this software constitutes
            certified financial, legal, tax, or investment advice.
          </p>
        </section>

        {/* Section 1: Acceptance */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            1. Acceptance of Terms
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            By creating an account, accessing, or using NisFlow Finance (&ldquo;the Application&rdquo; or &ldquo;Service&rdquo;),
            you agree to be bound by these Terms and Conditions (&ldquo;Terms&rdquo;) and our Privacy Policy. If you do
            not agree to these Terms, you must not access or use the Service.
          </p>
        </section>

        {/* Section 2: Eligibility & Accounts */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            2. Eligibility & Account Security
          </h2>
          <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
            <p>
              To use NisFlow, you must be of legal age to enter into a binding contract in your jurisdiction.
              You agree to:
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs pl-1">
              <li>Provide accurate, genuine information during registration.</li>
              <li>Maintain the confidentiality of your authentication credentials.</li>
              <li>Notify us immediately upon becoming aware of any unauthorized access to your account.</li>
              <li>Assume full responsibility for all activities occurring under your registered user credentials.</li>
            </ul>
          </div>
        </section>

        {/* Section 3: Financial & Accounting Information */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            3. Financial Records & Ledger Calculations
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            NisFlow operates on a double-entry accounting architecture with paise precision. The accuracy of
            balances, net worth calculations, loan schedules, and budget analytics depends entirely on the
            accuracy and completeness of the data you enter. You acknowledge and agree that:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground leading-relaxed pl-1">
            <li>You are responsible for regularly verifying that recorded transactions reflect your actual bank and investment accounts.</li>
            <li>Calculated loan interest, amortization schedules, and investment returns (such as XIRR) are software approximations and may differ from official institution statements due to compounding frequencies or banking fees.</li>
            <li>Tax estimates generated in the Tax Calculator or Tax Records module are for comparative educational reference and do not replace professional tax filing with tax authorities.</li>
          </ul>
        </section>

        {/* Section 4: AI Companion & Automated Intelligence */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            4. AI Features & Automated Guidance
          </h2>
          <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
            <p>
              NisFlow includes generative artificial intelligence features powered by third-party language models:
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs pl-1">
              <li>AI responses are non-deterministic and can produce inaccurate, incomplete, or outdated statements regarding banking rules, tax slabs, or investment strategies.</li>
              <li>You must evaluate and verify all AI suggestions before making financial commitments.</li>
              <li>NisFlow does not execute binding financial mutations autonomously without explicit user review and confirmation.</li>
            </ul>
          </div>
        </section>

        {/* Section 5: Acceptable Use */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            5. Acceptable Use & Prohibited Conduct
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            When using NisFlow Finance, you agree not to:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground leading-relaxed pl-1">
            <li>Attempt to access or tamper with data belonging to other users or tenants.</li>
            <li>Conduct adversarial prompt injection, automated vulnerability scanning, or denial-of-service attempts.</li>
            <li>Bypass rate limits, authentication barriers, or security controls.</li>
            <li>Upload malicious scripts, corrupted spreadsheets, or illegal materials to document storage.</li>
            <li>Reverse-engineer or exploit the application infrastructure for unlawful purposes.</li>
          </ul>
        </section>

        {/* Section 6: Data Deletion & Account Termination */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            6. Termination & Account Deletion
          </h2>
          <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
            <p>
              You may terminate your agreement with NisFlow Finance at any time by deleting your account
              via <em>Settings &gt; Danger Zone &gt; Delete Account</em>. Account deletion permanently purges
              your authentication record, profile, and all 35 database tables containing your financial records.
            </p>
            <p>
              We reserve the right to suspend or terminate accounts that violate these Terms, engage in
              harmful activity, or pose security risks to the platform or other users.
            </p>
          </div>
        </section>

        {/* Section 7: Limitation of Liability */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            7. Disclaimer of Warranties & Limitation of Liability
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            NisFlow Finance is provided on an &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; basis without warranties of
            any kind, whether express, statutory, or implied, including but not limited to implied warranties
            of merchantability, fitness for a particular purpose, or uninterrupted availability.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            To the maximum extent permitted by applicable law, NisFlow Finance, its developers, and contributors
            shall not be liable for any direct, indirect, incidental, consequential, special, or exemplary damages,
            including loss of profits, data loss, tax penalties, investment losses, or financial discrepancies
            arising from your use or inability to use the Service.
          </p>
        </section>

        {/* Section 8: Changes to Terms */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            8. Modifications to Terms
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We reserve the right to modify these Terms at any time. When updates are published, the revised
            Effective Date will be clearly posted at the top of this page. Continued use of NisFlow following
            posted revisions constitutes acceptance of the modified Terms.
          </p>
        </section>

        {/* Section 9: Contact */}
        <section className="rounded-xl border border-border/80 bg-card p-6 space-y-3">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            9. Contact Information
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            For questions or notices regarding these Terms, please contact our team:
          </p>
          <div className="text-xs text-foreground font-mono bg-muted/40 p-2.5 rounded-lg inline-block border">
            support@nisflow.finance
          </div>
        </section>

        {/* Footer */}
        <div className="border-t border-border/60 pt-6 flex justify-between items-center text-xs text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} NisFlow Finance. All rights reserved.</span>
          <Link href="/privacy" className="hover:text-foreground underline">
            Privacy Policy
          </Link>
        </div>
      </main>
    </div>
  );
}
