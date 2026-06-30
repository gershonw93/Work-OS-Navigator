import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, Hammer, MapPin, Clock, Users } from 'lucide-react'

export const metadata: Metadata = { title: 'About — SyteNav' }

const FACTS = [
  { icon: Users, k: 'Who', v: 'A team of builders and engineers who got tired of running jobs out of spreadsheets and group texts.' },
  { icon: Hammer, k: 'What', v: 'SyteNav brings the quote, the budget, the schedule, the field, and the invoices into one place.' },
  { icon: MapPin, k: 'Where', v: 'Headquartered in New Jersey, used by contractors across the country — on the jobsite and in the office.' },
  { icon: Clock, k: 'When', v: 'Founded in 2024. Today 2,400+ contractors run their jobs on SyteNav.' },
]

const NUMBERS = [
  ['2,400+', 'contractors'],
  ['$1.9B', 'contracts tracked'],
  ['48,000+', 'jobs managed'],
  ['37', 'states'],
]

export default function AboutPage() {
  return (
    <>
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-fg mb-2">About</p>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-ink leading-tight">We build software the way you build — to last.</h1>
        <p className="mt-5 text-lg text-muted-fg">
          Construction runs on coordination, and most of it still happens in spreadsheets, texts, and a filing cabinet. SyteNav puts the whole job — from the first quote to the final payment — in one place the office and the field actually share.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid sm:grid-cols-2 gap-5">
        {FACTS.map(f => (
          <div key={f.k} className="rounded-2xl border border-line bg-panel p-6">
            <div className="flex items-center gap-2 mb-2"><f.icon className="h-5 w-5 text-accent-fg" /><span className="text-accent-fg font-extrabold">{f.k}</span></div>
            <p className="text-ink-soft">{f.v}</p>
          </div>
        ))}
      </section>

      <section className="bg-panel border-y border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
          {NUMBERS.map(([v, l]) => (
            <div key={l}><p className="text-3xl sm:text-4xl font-extrabold text-ink">{v}</p><p className="text-sm text-muted-fg mt-1">{l}</p></div>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <h2 className="text-3xl font-bold text-ink">Come build with us</h2>
        <p className="mt-3 text-muted-fg">Set up your company and run your next job on SyteNav.</p>
        <Link href="/signup" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent text-accent-ink font-bold px-6 py-3 hover:bg-accent/90">Start free <ArrowRight className="h-4 w-4" /></Link>
      </section>
    </>
  )
}
