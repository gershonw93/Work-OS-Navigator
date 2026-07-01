import type { Metadata } from 'next'
import { Mail, MapPin, MessageSquare } from 'lucide-react'

export const metadata: Metadata = { title: 'Contact, SyteNav' }

export default function ContactPage() {
  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 grid lg:grid-cols-2 gap-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-fg mb-2">Contact</p>
        <h1 className="text-4xl font-extrabold text-ink leading-tight">Let’s talk about your jobs</h1>
        <p className="mt-4 text-muted-fg">Questions, a demo, or help getting set up, we’re quick to respond.</p>
        <div className="mt-8 space-y-4">
          <a href="mailto:hello@sytenav.com" className="flex items-center gap-3 text-ink-soft hover:text-ink"><span className="h-9 w-9 rounded-lg bg-accent-tint flex items-center justify-center"><Mail className="h-4 w-4 text-accent-fg" /></span> hello@sytenav.com</a>
          <p className="flex items-center gap-3 text-ink-soft"><span className="h-9 w-9 rounded-lg bg-accent-tint flex items-center justify-center"><MessageSquare className="h-4 w-4 text-accent-fg" /></span> Mon–Fri, 8am–6pm ET</p>
          <p className="flex items-center gap-3 text-ink-soft"><span className="h-9 w-9 rounded-lg bg-accent-tint flex items-center justify-center"><MapPin className="h-4 w-4 text-accent-fg" /></span> New Jersey, USA</p>
        </div>
      </div>

      {/* Simple mailto-based form (no backend wired) */}
      <form action="mailto:hello@sytenav.com" method="post" encType="text/plain" className="rounded-2xl border border-line bg-panel p-6 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm text-ink-soft">Name</label>
          <input name="name" required className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm text-ink-soft">Email</label>
          <input name="email" type="email" required className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm text-ink-soft">Company</label>
          <input name="company" className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm text-ink-soft">How can we help?</label>
          <textarea name="message" rows={4} className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none resize-none" />
        </div>
        <button type="submit" className="w-full rounded-xl bg-accent text-accent-ink font-bold py-3 hover:bg-accent/90">Send message</button>
      </form>
    </section>
  )
}
