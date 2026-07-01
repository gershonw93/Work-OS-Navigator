import type { Metadata } from 'next'
import Link from 'next/link'
import { Mail, MapPin, MessageSquare, Rocket, ArrowRight } from 'lucide-react'
import { marketingMeta } from '@/components/marketing/meta'
import { Eyebrow } from '@/components/marketing/section'

export const metadata: Metadata = marketingMeta({
  title: 'Contact · SyteNav',
  description:
    'Questions, a walkthrough, or help getting your company set up on SyteNav. We answer fast, Monday through Friday, 8am to 6pm ET.',
  path: '/homepage/contact',
})

export default function ContactPage() {
  return (
    <>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-20 sm:pb-28 grid lg:grid-cols-2 gap-12 lg:gap-16">
        <div>
          <Eyebrow>Contact</Eyebrow>
          <h1 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tight text-ink leading-[1.05]">
            Talk to someone who knows what a draw schedule is.
          </h1>
          <p className="mt-5 text-lg text-muted-fg leading-relaxed">
            Questions, a walkthrough with your own jobs, or help moving the company over. Real answers, fast, from people who&apos;ve stood on a slab.
          </p>

          <div className="mt-10 space-y-5">
            <a href="mailto:hello@sytenav.com" className="flex items-center gap-4 text-ink-soft hover:text-ink transition-colors">
              <span className="h-11 w-11 rounded-xl bg-accent-tint flex items-center justify-center shrink-0">
                <Mail className="h-5 w-5 text-accent-fg" />
              </span>
              <span>
                <span className="block font-semibold text-ink">hello@sytenav.com</span>
                <span className="block text-sm text-muted-fg">Sales, support, and everything else</span>
              </span>
            </a>
            <p className="flex items-center gap-4 text-ink-soft">
              <span className="h-11 w-11 rounded-xl bg-accent-tint flex items-center justify-center shrink-0">
                <MessageSquare className="h-5 w-5 text-accent-fg" />
              </span>
              <span>
                <span className="block font-semibold text-ink">Mon to Fri, 8am to 6pm ET</span>
                <span className="block text-sm text-muted-fg">Contractor hours, we&apos;re up early too</span>
              </span>
            </p>
            <p className="flex items-center gap-4 text-ink-soft">
              <span className="h-11 w-11 rounded-xl bg-accent-tint flex items-center justify-center shrink-0">
                <MapPin className="h-5 w-5 text-accent-fg" />
              </span>
              <span>
                <span className="block font-semibold text-ink">New Jersey, USA</span>
                <span className="block text-sm text-muted-fg">Used on jobsites in 37 states</span>
              </span>
            </p>
          </div>

          <div className="mt-10 rounded-2xl border border-line bg-panel p-5 flex items-start gap-4">
            <span className="h-11 w-11 rounded-xl bg-accent flex items-center justify-center shrink-0">
              <Rocket className="h-5 w-5 text-accent-ink" />
            </span>
            <div>
              <p className="font-semibold text-ink">In a hurry?</p>
              <p className="text-sm text-muted-fg mt-1">
                You don&apos;t need a call to start. Create your company and upload a quote, it takes about four minutes.
              </p>
              <Link href="/signup" className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-fg hover:gap-2.5 transition-all">
                Start free <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* Simple mailto-based form (no backend wired) */}
        <form action="mailto:hello@sytenav.com" method="post" encType="text/plain" className="rounded-3xl border border-line bg-panel p-6 sm:p-8 space-y-5 self-start">
          <div className="space-y-1.5">
            <label htmlFor="contact-name" className="text-sm font-medium text-ink-soft">Name</label>
            <input id="contact-name" name="name" required autoComplete="name" className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="contact-email" className="text-sm font-medium text-ink-soft">Email</label>
            <input id="contact-email" name="email" type="email" required autoComplete="email" className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="contact-company" className="text-sm font-medium text-ink-soft">Company</label>
            <input id="contact-company" name="company" autoComplete="organization" className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="contact-message" className="text-sm font-medium text-ink-soft">How can we help?</label>
            <textarea id="contact-message" name="message" rows={5} className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none resize-none" />
          </div>
          <button type="submit" className="w-full rounded-xl bg-accent text-accent-ink font-bold py-3.5 hover:bg-accent/90 transition-colors">
            Send message
          </button>
          <p className="text-xs text-faint text-center">We reply within one business day, usually much faster.</p>
        </form>
      </section>
    </>
  )
}
