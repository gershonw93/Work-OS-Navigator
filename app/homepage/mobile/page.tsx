import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight, BookOpen, Camera, CalendarDays, CheckSquare, Clock, HardHat,
  Quote as QuoteIcon, ScanLine, Smartphone, Sun, WifiOff,
} from 'lucide-react'
import { marketingMeta } from '@/components/marketing/meta'
import { PhoneMock, LogScreen, ClockScreen, ScanScreen, TasksScreen } from '@/components/marketing/phone-mock'
import { BlueprintGrid } from '@/components/marketing/blueprint'
import { Reveal } from '@/components/marketing/reveal'
import { SectionHead, Eyebrow } from '@/components/marketing/section'
import { CtaBand } from '@/components/marketing/cta-band'

export const metadata: Metadata = marketingMeta({
  title: 'On the go · SyteNav on the jobsite',
  description:
    'SyteNav runs where the work is: daily logs with photos, one-tap time clock with location, tasks, schedules, and camera document scanning, all from the phone already in your pocket.',
  path: '/homepage/mobile',
})

const FIELD_TOOLS = [
  { icon: BookOpen, title: 'Daily logs in two minutes', body: 'Weather, crew count, photos, and notes filed from the tailgate. The office sees it before you leave the lot.' },
  { icon: Clock, title: 'One-tap time clock', body: 'Clock in and out with location attached. Timesheets build themselves, payroll gets clean hours.' },
  { icon: ScanLine, title: 'Scan paper with the camera', body: 'A sub hands you a paper quote, you photograph it, and AI turns it into line items before you reach the truck.' },
  { icon: CheckSquare, title: 'Tasks that fit a thumb', body: 'The crew opens the phone and sees exactly what today is: their tasks, checked off as the work happens.' },
  { icon: CalendarDays, title: 'The week at a glance', body: 'Crew dates, deliveries, and inspections on a schedule that reads at arm’s length in the sun.' },
  { icon: Camera, title: 'Plans & photos on site', body: 'The current drawing set and every site photo, right where the question comes up.' },
]

const WORKERS = [
  { role: 'The crew', body: 'Opens the phone, sees today’s tasks, clocks in, done. No manual, no training day, no passwords on a sticky note.' },
  { role: 'The field supervisor', body: 'Files the daily log with photos in two minutes, checks tomorrow’s schedule, answers the office once instead of five times.' },
  { role: 'The PM and the boss', body: 'Approves timesheets and invoices from the truck, watches every job’s log roll in, and drills into any number without a laptop.' },
]

export default function MobilePage() {
  return (
    <>
      {/* Hero, blueprint paper behind */}
      <section className="relative overflow-hidden">
        <BlueprintGrid />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16 sm:pb-24 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <Eyebrow>On the go</Eyebrow>
            <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-ink leading-[1.04]">
              The office is wherever your boots are.
            </h1>
            <p className="mt-6 text-lg text-muted-fg leading-relaxed">
              SyteNav is built for the phone already in your pocket: big targets for gloved hands, screens that read in direct sun, and the two-minute workflows a jobsite actually allows. Every worker on the crew can use it on day one.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-accent text-accent-ink font-bold px-6 py-3 hover:bg-accent/90 transition-colors">
                Start free <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/homepage/features" className="inline-flex items-center gap-2 rounded-xl border border-line text-ink-soft font-semibold px-6 py-3 hover:bg-panel transition-colors">
                All features
              </Link>
            </div>
            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
              Any phone · Nothing to install · Works on day one
            </p>
          </div>
          <Reveal delay={150} className="flex justify-center lg:justify-end">
            <PhoneMock><LogScreen /></PhoneMock>
          </Reveal>
        </div>
      </section>

      {/* Mono proof strip */}
      <section className="border-y border-line bg-panel">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 font-mono text-[11px] sm:text-xs uppercase tracking-[0.18em] text-muted-fg text-center">
          <span className="flex items-center gap-2"><BookOpen className="h-3.5 w-3.5 text-accent-fg" /> 2 min average daily log</span>
          <span className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-accent-fg" /> 1 tap to clock in</span>
          <span className="flex items-center gap-2"><ScanLine className="h-3.5 w-3.5 text-accent-fg" /> 14s camera-to-line-items</span>
          <span className="flex items-center gap-2"><HardHat className="h-3.5 w-3.5 text-accent-fg" /> 0 training required</span>
        </div>
      </section>

      {/* Field tools */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <Reveal>
          <SectionHead
            eyebrow="Built for the field"
            title="Everything the jobsite needs, one thumb"
            lead="Not a shrunken desktop app. Each field tool was designed on a phone first, for people holding a level in the other hand."
            className="mb-14 sm:mb-16"
          />
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12">
          {FIELD_TOOLS.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 90}>
              <div>
                <span className="h-11 w-11 rounded-xl bg-accent flex items-center justify-center mb-4">
                  <f.icon className="h-5 w-5 text-accent-ink" />
                </span>
                <h3 className="text-lg font-bold text-ink">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-fg leading-relaxed">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Three phones */}
      <section className="bg-panel border-y border-line overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <Reveal>
            <SectionHead
              center
              eyebrow="A day in the pocket"
              title="Clock in. Knock it out. Log it."
              className="mb-14 sm:mb-20"
            />
          </Reveal>
          <div className="flex flex-wrap items-start justify-center gap-8 lg:gap-14">
            <Reveal delay={0} className="lg:mt-10">
              <PhoneMock className="-rotate-2"><ClockScreen /></PhoneMock>
              <p className="mt-5 text-center text-sm text-muted-fg">6:58 AM · clocked in, location attached</p>
            </Reveal>
            <Reveal delay={120}>
              <PhoneMock><TasksScreen /></PhoneMock>
              <p className="mt-5 text-center text-sm text-muted-fg">The day&apos;s tasks, checked off as they happen</p>
            </Reveal>
            <Reveal delay={240} className="lg:mt-10">
              <PhoneMock className="rotate-2"><ScanScreen /></PhoneMock>
              <p className="mt-5 text-center text-sm text-muted-fg">Paper quote to line items, from the camera</p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* For every worker */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <Reveal>
          <SectionHead
            eyebrow="For every hard hat"
            title="Easy enough for the whole crew, not just the office"
            lead="Role-based views keep each phone simple. Everyone sees their day, nobody wades through screens meant for someone else."
            className="mb-14"
          />
        </Reveal>
        <div className="grid md:grid-cols-3 gap-10 md:gap-8">
          {WORKERS.map((w, i) => (
            <Reveal key={w.role} delay={i * 100}>
              <div className="border-l-2 border-accent pl-5">
                <h3 className="text-lg font-bold text-ink">{w.role}</h3>
                <p className="mt-2 text-sm text-muted-fg leading-relaxed">{w.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Dark band: jobsite conditions */}
      <section className="dark">
        <div className="bg-surface text-ink border-y border-line">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-24 text-center">
            <Reveal>
              <Eyebrow className="justify-center">Jobsite proof</Eyebrow>
              <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-ink leading-[1.06] max-w-3xl mx-auto">
                Made for dust, gloves, and glare.
              </h2>
            </Reveal>
            <div className="mt-12 grid sm:grid-cols-3 gap-10 sm:gap-6 max-w-3xl mx-auto">
              {[
                { icon: Smartphone, title: 'Nothing to install', body: 'Opens in the browser on any phone. Add it to the home screen and it feels native.' },
                { icon: Sun, title: 'Readable outside', body: 'High-contrast type and big targets, checked in light and dark mode.' },
                { icon: WifiOff, title: 'Forgiving on-site', body: 'Spotty signal on the pour? Your entry keeps until it can send.' },
              ].map((x, i) => (
                <Reveal key={x.title} delay={i * 110}>
                  <div>
                    <span className="mx-auto h-12 w-12 rounded-2xl bg-accent flex items-center justify-center mb-4">
                      <x.icon className="h-6 w-6 text-accent-ink" />
                    </span>
                    <h3 className="font-bold text-ink">{x.title}</h3>
                    <p className="mt-2 text-sm text-muted-fg leading-relaxed">{x.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
        <Reveal>
          <figure>
            <QuoteIcon className="h-7 w-7 text-accent-fg mx-auto mb-5" aria-hidden />
            <blockquote className="text-xl sm:text-2xl text-ink font-medium leading-relaxed">
              &ldquo;My guys are not software people. They clock in, check their list, and snap photos for the log. That&apos;s the whole app for them, and that&apos;s why it works.&rdquo;
            </blockquote>
            <figcaption className="mt-6 text-sm">
              <span className="font-semibold text-ink">Dani R.</span>{' '}
              <span className="text-faint">· Electrical subcontractor, 3 crews · Brooklyn, NY</span>
            </figcaption>
          </figure>
        </Reveal>
      </section>

      <CtaBand title="Put the job in every pocket" body="Start free, invite the crew, and watch the first daily log arrive before lunch." />
    </>
  )
}
