import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, Hammer, MapPin, Ruler, HeartHandshake } from 'lucide-react'
import { marketingMeta } from '@/components/marketing/meta'
import { Reveal } from '@/components/marketing/reveal'
import { CountUp } from '@/components/marketing/count-up'
import { Eyebrow } from '@/components/marketing/section'
import { CtaBand } from '@/components/marketing/cta-band'

export const metadata: Metadata = marketingMeta({
  title: 'About · SyteNav',
  description:
    'SyteNav is built by builders and engineers who got tired of running jobs out of spreadsheets and group texts. Headquartered in New Jersey, used by contractors in 11 states.',
  path: '/homepage/about',
})

const VALUES = [
  {
    icon: Hammer,
    title: 'Field first',
    body: 'If it doesn’t work one-handed on a phone in the rain, it doesn’t ship. The office view is built on top of the field, never the other way around.',
  },
  {
    icon: Ruler,
    title: 'Measure twice',
    body: 'Money software has no room for “roughly.” Every number in SyteNav traces back to a line item someone can point at.',
  },
  {
    icon: HeartHandshake,
    title: 'Both sides of the contract',
    body: 'We build for the GC and the sub at the same time, because every job has both, and software that picks a side just moves the paperwork around.',
  },
]

const NUMBERS = [
  { end: 140, suffix: '+', label: 'contractors' },
  { end: 42, prefix: '$', suffix: 'M', label: 'contracts tracked' },
  { end: 1800, suffix: '+', label: 'jobs managed' },
  { end: 11, label: 'states' },
]

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-14 text-center">
        <Eyebrow className="justify-center">About</Eyebrow>
        <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-ink leading-[1.04]">
          We build software the way you build. To last.
        </h1>
      </section>

      {/* Story */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
        <Reveal>
          <div className="space-y-5 text-lg text-muted-fg leading-relaxed">
            <p>
              SyteNav started in 2024 the way most construction software should: with a contractor losing a Sunday to spreadsheets. One of our founders was running eight jobs off a laptop at the kitchen table, rebuilding the same master sheet from six other sheets, while the answers he needed sat in a group text, a shoebox of receipts, and a sub’s voicemail.
            </p>
            <p>
              The insight wasn’t that construction needs more software. It’s that the job already exists on paper, in quotes, permits, invoices, and plans, and someone is always retyping it. So we built the system around a different first step: read the paperwork, and let the job build itself.
            </p>
            <p>
              Today a team of builders and engineers in New Jersey ships SyteNav to contractors in 11 states. We stay close to the field, our roadmap comes from jobsite phone calls, not conference keynotes, and we measure ourselves on one thing: whether the people who run real jobs get home earlier.
            </p>
          </div>
        </Reveal>
        <Reveal delay={100}>
          <p className="mt-8 flex items-center gap-2 text-sm text-faint">
            <MapPin className="h-4 w-4" /> Headquartered in New Jersey, on jobsites everywhere.
          </p>
        </Reveal>
      </section>

      {/* Numbers, dark band */}
      <section className="dark">
        <div className="bg-surface text-ink border-y border-line">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10 text-center">
            {NUMBERS.map((n, i) => (
              <Reveal key={n.label} delay={i * 90}>
                <p className="font-display font-bold text-4xl sm:text-5xl text-ink tracking-tight">
                  <CountUp end={n.end} prefix={n.prefix} suffix={n.suffix} />
                </p>
                <p className="text-sm text-muted-fg mt-2">{n.label}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <Reveal>
          <div className="text-center max-w-2xl mx-auto mb-14">
            <Eyebrow className="justify-center">How we work</Eyebrow>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Three rules we don&apos;t break</h2>
          </div>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-12 md:gap-8">
          {VALUES.map((v, i) => (
            <Reveal key={v.title} delay={i * 110}>
              <div className="text-center">
                <span className="mx-auto h-12 w-12 rounded-2xl bg-accent flex items-center justify-center mb-5">
                  <v.icon className="h-6 w-6 text-accent-ink" />
                </span>
                <h3 className="text-xl font-bold text-ink">{v.title}</h3>
                <p className="mt-3 text-muted-fg leading-relaxed max-w-xs mx-auto">{v.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <CtaBand title="Come build with us" body="Set up your company and run your next job on SyteNav." />
    </>
  )
}
