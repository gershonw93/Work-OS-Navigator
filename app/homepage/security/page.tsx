import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ShieldCheck, Lock, KeyRound, Server, EyeOff, DatabaseBackup, UserCog, FileDown,
} from 'lucide-react'
import { marketingMeta } from '@/components/marketing/meta'
import { Reveal } from '@/components/marketing/reveal'
import { Eyebrow } from '@/components/marketing/section'
import { CtaBand } from '@/components/marketing/cta-band'

export const metadata: Metadata = marketingMeta({
  title: 'Security · SyteNav',
  description:
    'How SyteNav protects your jobs and your money data: encryption in transit and at rest, role-based access, delete protection, backups, and AI processing that never trains on your documents.',
  path: '/homepage/security',
})

const PRACTICES = [
  {
    icon: Lock,
    title: 'Encryption everywhere',
    body: 'Data is encrypted in transit with TLS and at rest on our infrastructure. Your contracts and financials never travel or sit in the clear.',
  },
  {
    icon: UserCog,
    title: 'Role-based access',
    body: 'Admin, PM, office, field, and crew roles each see exactly what they should. A crew member never stumbles into the company financials.',
  },
  {
    icon: KeyRound,
    title: 'Delete protection',
    body: 'Destructive actions on money and files require a separate secret key. A rushed tap or a shared login can’t erase a job’s history.',
  },
  {
    icon: Server,
    title: 'Hardened infrastructure',
    body: 'SyteNav runs on established cloud infrastructure with network isolation, managed Postgres, and row-level security enforced at the database layer.',
  },
  {
    icon: EyeOff,
    title: 'AI that keeps secrets',
    body: 'Documents you scan are processed only to extract your data. They are never used to train third-party models and are not retained by AI providers.',
  },
  {
    icon: DatabaseBackup,
    title: 'Backups & recovery',
    body: 'Automated backups with point-in-time recovery protect against the bad day, whether it’s ours or yours.',
  },
  {
    icon: ShieldCheck,
    title: 'Least-privilege by default',
    body: 'New team members start with the narrowest sensible access. Nobody gets the keys to everything by accident.',
  },
  {
    icon: FileDown,
    title: 'Your data stays yours',
    body: 'Export your projects, financials, and documents whenever you want. Leaving is easy, which is exactly why you won’t need to.',
  },
]

export default function SecurityPage() {
  return (
    <>
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-14 sm:pb-20 text-center">
        <Eyebrow className="justify-center">Security</Eyebrow>
        <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-ink leading-[1.04]">
          Your jobs are your business. Literally.
        </h1>
        <p className="mt-6 text-lg text-muted-fg leading-relaxed max-w-2xl mx-auto">
          Contracts, margins, client payments, crew hours. What lives in SyteNav is the financial heart of your company, and we treat it that way. Here is exactly how.
        </p>
      </section>

      {/* Practices grid */}
      <section className="bg-panel border-y border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12">
            {PRACTICES.map((p, i) => (
              <Reveal key={p.title} delay={(i % 4) * 80}>
                <div>
                  <span className="h-11 w-11 rounded-xl bg-accent-tint flex items-center justify-center mb-4">
                    <p.icon className="h-5 w-5 text-accent-fg" />
                  </span>
                  <h2 className="text-base font-bold text-ink">{p.title}</h2>
                  <p className="mt-2 text-sm text-muted-fg leading-relaxed">{p.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Longer prose */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
        <Reveal>
          <Eyebrow>The details</Eyebrow>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">How we think about your data</h2>
          <div className="mt-6 space-y-5 text-muted-fg leading-relaxed">
            <p>
              SyteNav is built on managed cloud infrastructure with row-level security enforced in the database itself, not just in the application. Every query is scoped to your company, so isolation between customers is a property of the data layer, not a promise in a policy document.
            </p>
            <p>
              When you upload a document for AI scanning, we send only what is needed to perform the extraction, receive back structured data, and store the result in your account. Your documents are not used to train models, ours or anyone else’s, and our AI providers are contractually barred from retaining them.
            </p>
            <p>
              Access inside your company is governed by roles you control, and the most dangerous actions, deleting financial records and files, sit behind an additional secret key. Backups run automatically and support point-in-time recovery.
            </p>
            <p>
              Found something we should know about? We take reports seriously and respond fast. Write to{' '}
              <a href="mailto:security@sytenav.com" className="text-accent-fg font-semibold hover:underline">security@sytenav.com</a>{' '}
              and include enough detail to reproduce. For everything else, our{' '}
              <Link href="/homepage/privacy" className="text-accent-fg font-semibold hover:underline">Privacy Policy</Link>{' '}
              and <Link href="/homepage/terms" className="text-accent-fg font-semibold hover:underline">Terms of Service</Link>{' '}
              spell out the commitments in full.
            </p>
          </div>
        </Reveal>
      </section>

      <CtaBand title="Build on solid ground" body="Start free and see the roles, protections, and audit trail for yourself." />
    </>
  )
}
