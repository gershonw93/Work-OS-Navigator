'use client'

import { SUPPORT_EMAIL } from '@/lib/support-email'
import { CONTACT_HONEYPOT, CONTACT_LIMITS, contactProblem } from '@/lib/contact-message'
import { fetchProblem } from '@/lib/fetch-error'
import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'

// The contact form POSTS to /api/contact, which keeps the message and emails
// it to the support inbox. It used to build a mailto: link instead, which does
// nothing at all on a machine with no mail app - see lib/contact-message.ts.
export function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (sending) return
    const problem = contactProblem({ name: name.trim(), email: email.trim(), company: company.trim(), message: message.trim() })
    if (problem) { setError(problem); return }
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, company, message, [CONTACT_HONEYPOT]: website }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `We could not send that just now - email us at ${SUPPORT_EMAIL} instead.`)
      setSent(true)
    } catch (err) {
      setError(fetchProblem(err, 'sending your message'))
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div role="status" className="rounded-3xl border border-line bg-panel p-6 sm:p-8 space-y-3 self-start text-center">
        <CheckCircle2 className="h-10 w-10 text-success mx-auto" aria-hidden />
        <h2 className="font-display text-xl font-bold text-ink">Message sent</h2>
        <p className="text-sm text-muted-fg">
          Thanks, {name.trim().split(/\s+/)[0]}. It is in our inbox, and we will reply to {email.trim()}.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-3xl border border-line bg-panel p-6 sm:p-8 space-y-5 self-start">
      <div className="space-y-1.5">
        <label htmlFor="contact-name" className="text-sm font-medium text-ink-soft">Name</label>
        <input
          id="contact-name"
          name="name"
          required
          maxLength={CONTACT_LIMITS.name}
          autoComplete="name"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="contact-email" className="text-sm font-medium text-ink-soft">Email</label>
        <input
          id="contact-email"
          name="email"
          type="email"
          required
          maxLength={CONTACT_LIMITS.email}
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="contact-company" className="text-sm font-medium text-ink-soft">Company <span className="text-faint font-normal">(optional)</span></label>
        <input
          id="contact-company"
          name="company"
          maxLength={CONTACT_LIMITS.company}
          autoComplete="organization"
          value={company}
          onChange={e => setCompany(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
        />
      </div>
      {/* Nobody sees this; a bot filling every field does. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name={CONTACT_HONEYPOT} tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="contact-message" className="text-sm font-medium text-ink-soft">How can we help?</label>
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          required
          maxLength={CONTACT_LIMITS.message}
          value={message}
          onChange={e => setMessage(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none resize-none"
        />
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={sending} className="w-full rounded-xl bg-accent text-accent-ink font-bold py-3.5 hover:bg-accent/90 transition-colors disabled:opacity-60">
        {sending ? 'Sending...' : 'Send message'}
      </button>
      <p className="text-xs text-faint text-center">We reply by email. Prefer to write us directly? {SUPPORT_EMAIL}</p>
    </form>
  )
}
