'use client'

import { useState } from 'react'

// A contact form that opens the visitor's email client with the message
// pre-filled. It builds a mailto: link in JS on submit instead of using
// action="mailto:" / method="post", which browsers flag as an insecure form
// (disabling autofill and showing a "not secure" warning).
export function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [message, setMessage] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const subject = `SyteNav enquiry from ${name || 'a contractor'}`
    const lines = [`Name: ${name}`, `Email: ${email}`]
    if (company) lines.push(`Company: ${company}`)
    lines.push('', message)
    const body = lines.join('\n')
    window.location.href = `mailto:hello@sytenav.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-line bg-panel p-6 sm:p-8 space-y-5 self-start">
      <div className="space-y-1.5">
        <label htmlFor="contact-name" className="text-sm font-medium text-ink-soft">Name</label>
        <input
          id="contact-name"
          name="name"
          required
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
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="contact-company" className="text-sm font-medium text-ink-soft">Company</label>
        <input
          id="contact-company"
          name="company"
          autoComplete="organization"
          value={company}
          onChange={e => setCompany(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="contact-message" className="text-sm font-medium text-ink-soft">How can we help?</label>
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          required
          value={message}
          onChange={e => setMessage(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-accent focus:outline-none resize-none"
        />
      </div>
      <button type="submit" className="w-full rounded-xl bg-accent text-accent-ink font-bold py-3.5 hover:bg-accent/90 transition-colors">
        Send message
      </button>
      <p className="text-xs text-faint text-center">Opens your email app. Prefer to write us directly? hello@sytenav.com</p>
    </form>
  )
}
