import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const HERO_METRICS = [
  { label: "Modes", value: "Video + Audio + Chat", tone: "bg-blue-light" },
  { label: "Doctor Access", value: "Verified & Approved", tone: "bg-emerald-light" },
  { label: "Prescription", value: "Digital + QR", tone: "bg-amber-light" },
  { label: "Network Mode", value: "Offline First", tone: "bg-red-light" },
];

const FEATURES = [
  {
    icon: "01",
    title: "Low-Bandwidth Consultations",
    desc: "Video first. Audio and chat fallback when network is poor.",
    tone: "bg-blue-light",
  },
  {
    icon: "02",
    title: "Verified Doctor Network",
    desc: "Only approved doctors can go live and run consultations.",
    tone: "bg-emerald-light",
  },
  {
    icon: "03",
    title: "Digital Prescriptions",
    desc: "Structured prescription with QR code and full medicine detail.",
    tone: "bg-amber-light",
  },
  {
    icon: "04",
    title: "Pharmacy Visibility",
    desc: "Live stock transparency and reservation workflow by prescription.",
    tone: "bg-red-light",
  },
];

const CORE_FLOW = [
  { step: "1", title: "Book Doctor", desc: "Patient chooses doctor, time, and call mode." },
  { step: "2", title: "Doctor Goes Live", desc: "Only doctor starts live consultation room." },
  { step: "3", title: "Consult", desc: "Patient joins when status is live." },
  { step: "4", title: "Generate Rx", desc: "Doctor finalizes prescription with dosage details." },
  { step: "5", title: "Fulfill", desc: "Pharmacy checks stock from QR and reserves medicines." },
];

const ROLE_BLOCKS = [
  {
    role: "Patient",
    points: ["Book consultation", "Track history", "View prescription detail", "Upload personal records"],
  },
  {
    role: "Doctor",
    points: ["Run live session", "Write structured prescription", "Set slots", "Close consultation"],
  },
  {
    role: "Pharmacy",
    points: ["Manage inventory", "Read QR", "Accept reservations", "Mark fulfilled"],
  },
  {
    role: "Admin",
    points: ["Approve users", "View analytics", "Track audit logs", "Control operations"],
  },
];

export default function Home() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1360px] space-y-8 px-5 py-8 lg:px-8 lg:py-12">
        <section className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <Card className="nb-rise relative overflow-hidden bg-card">
            <CardContent className="space-y-6 py-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="pill-success">MVP READY</span>
                <span className="pill-info">LOW BANDWIDTH</span>
                <span className="pill-warning">NO RISKY AI DIAGNOSIS</span>
              </div>

              <div className="space-y-3">
                <h1 className="max-w-3xl text-4xl font-black leading-[0.95] tracking-[-0.04em] text-foreground lg:text-6xl">
                  SANJEEVNI
                  <br />
                  RURAL TELEMEDICINE
                </h1>
                <p className="max-w-2xl text-base font-medium text-muted-foreground lg:text-lg">
                  Verified doctors. Digital prescriptions. Transparent medicine availability.
                  Built to work in low-connectivity environments.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href="/login">
                  <Button size="lg" className="text-base">
                    Start Now
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button variant="outline" size="lg" className="text-base">
                    Open Dashboard
                  </Button>
                </Link>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border-2 border-border bg-blue-light px-3 py-2 text-xs font-bold shadow-[3px_3px_0px_0px_var(--shadow)]">
                  Patient books doctor
                </div>
                <div className="rounded-lg border-2 border-border bg-amber-light px-3 py-2 text-xs font-bold shadow-[3px_3px_0px_0px_var(--shadow)]">
                  Doctor generates QR Rx
                </div>
                <div className="rounded-lg border-2 border-border bg-emerald-light px-3 py-2 text-xs font-bold shadow-[3px_3px_0px_0px_var(--shadow)]">
                  Pharmacy verifies stock
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3">
            {HERO_METRICS.map((metric, index) => (
              <Card key={metric.label} className={`nb-rise nb-delay-${Math.min(index + 1, 4)} ${metric.tone}`}>
                <CardContent className="py-5">
                  <div className="text-xs font-black uppercase tracking-[0.08em] text-muted-foreground">
                    {metric.label}
                  </div>
                  <div className="mt-1 text-lg font-black tracking-tight text-foreground">
                    {metric.value}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="nb-rise nb-delay-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, index) => (
            <Card key={feature.title} className={feature.tone}>
              <CardContent className="space-y-4 py-5">
                <div className="inline-flex rounded-md border-2 border-border bg-card px-2 py-1 text-sm font-black shadow-[3px_3px_0px_0px_var(--shadow)]">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-black leading-tight">{feature.title}</h3>
                <p className="text-sm font-medium text-muted-foreground">{feature.desc}</p>
                <div className="text-xs font-black uppercase tracking-wide text-foreground/70">
                  Core Feature {index + 1}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="nb-rise nb-delay-3">
          <Card>
            <CardContent className="space-y-5 py-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-black tracking-tight lg:text-3xl">MVP Flow That Must Work</h2>
                <span className="pill-danger">Hackathon Critical Path</span>
              </div>

              <div className="grid gap-3 md:grid-cols-5">
                {CORE_FLOW.map((item) => (
                  <div key={item.step} className="rounded-xl border-2 border-border bg-card p-3 shadow-[4px_4px_0px_0px_var(--shadow)]">
                    <div className="mb-2 inline-flex size-8 items-center justify-center rounded-md border-2 border-border bg-primary text-sm font-black text-primary-foreground">
                      {item.step}
                    </div>
                    <h3 className="text-base font-black">{item.title}</h3>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="nb-rise nb-delay-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {ROLE_BLOCKS.map((block) => (
            <Card key={block.role}>
              <CardContent className="space-y-3 py-5">
                <div className="inline-flex rounded-full border-2 border-border bg-secondary px-3 py-1 text-xs font-black uppercase tracking-wide">
                  {block.role}
                </div>
                <div className="space-y-1.5">
                  {block.points.map((point) => (
                    <div key={point} className="rounded-md border-2 border-border bg-muted px-2.5 py-1.5 text-xs font-bold">
                      {point}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="nb-pop">
          <div className="rounded-2xl border-2 border-border bg-foreground p-6 text-background shadow-[8px_8px_0px_0px_var(--shadow)] lg:p-8">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-background lg:text-3xl">
                  Build Healthcare Access That Works in Real Conditions
                </h2>
                <p className="mt-2 max-w-2xl text-sm font-medium text-background/80 lg:text-base">
                  SANJEEVNI keeps consultations, records, and prescriptions operational even with unstable internet.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/login">
                  <Button size="lg" variant="secondary" className="bg-accent text-accent-foreground hover:bg-accent/90">
                    Launch App
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button size="lg" variant="outline" className="bg-card text-foreground hover:bg-muted">
                    View MVP
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
