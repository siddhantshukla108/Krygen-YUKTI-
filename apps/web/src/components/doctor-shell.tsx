"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { mvpApi } from "@/lib/mvp-api";

const NAV_ITEMS = [
  { href: "/dashboard/doctor", label: "Dashboard", icon: "📊" },
  { href: "/dashboard/doctor/appointments", label: "Appointments", icon: "📅" },
  { href: "/dashboard/doctor/prescriptions", label: "Rx Creator", icon: "💊" },
  { href: "/dashboard/doctor/history", label: "History", icon: "💬" },
  { href: "/dashboard/doctor/settings", label: "Settings", icon: "⚙️" },
];

export default function DoctorShell({
  children,
  userId,
  userName,
}: {
  children: React.ReactNode;
  userId: string;
  userName: string;
}) {
  const pathname = usePathname();
  const [isLive, setIsLive] = useState(false);
  const shortName = userName.split(" ")[0] ?? userName;

  useEffect(() => {
    // Poll for live status
    const checkLive = async () => {
      try {
        const response = await mvpApi.get<{ appointments: { status: string }[] }>("/appointments/me", userId);
        const live = response.appointments.some((a) => a.status === "IN_PROGRESS");
        setIsLive(live);
      } catch (e) {
        console.error(e);
      }
    };
    void checkLive();
    const interval = setInterval(checkLive, 10000);
    return () => clearInterval(interval);
  }, [userId]);

  return (
    <div className="grid min-h-[calc(100svh-52px)] grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* Sidebar */}
      <aside className="hidden border-r-2 border-border bg-card p-6 lg:sticky lg:top-0 lg:block lg:h-[calc(100svh-52px)]">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-lg border-2 border-border bg-primary text-xl font-black text-primary-foreground shadow-[2px_2px_0px_0px_var(--shadow)]">
            S
          </div>
          <div>
            <div className="font-heading text-lg font-bold text-foreground leading-none">Sanjeevni</div>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Doctor Portal</div>
          </div>
        </div>

        <nav className="space-y-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-sm font-bold transition-all ${
                  active
                    ? "border-border bg-primary text-black shadow-[4px_4px_0px_0px_var(--shadow)] translate-x-[-2px] translate-y-[-2px]"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:border-border hover:text-foreground"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>

        <div className={`mt-8 rounded-lg border-2 border-border p-4 shadow-[4px_4px_0px_0px_var(--shadow)] ${isLive ? "bg-red-light" : "bg-blue-light"}`}>
          <div className="flex items-center gap-2 text-sm font-bold text-black">
            <span className={`size-3 rounded-full border border-border ${isLive ? "bg-red animate-pulse" : "bg-emerald"}`} />
            {isLive ? "Live Session" : "Available"}
          </div>
          <div className="mt-1 text-xs font-medium text-black">
            {isLive ? "You are in a call." : "Waiting for patients..."}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="w-full overflow-x-hidden bg-background">
        <div className="border-b-2 border-border bg-card px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-primary text-sm font-black text-primary-foreground shadow-[2px_2px_0px_0px_var(--shadow)]">
                S
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-foreground">Doctor Portal</div>
                <div className="truncate text-xs font-medium text-muted-foreground">{shortName}</div>
              </div>
            </div>
            <span className={`rounded-full border-2 border-border px-2 py-1 text-[10px] font-bold shadow-[2px_2px_0px_0px_var(--shadow)] ${isLive ? "bg-red-light text-black" : "bg-emerald-light text-black"}`}>
              {isLive ? "LIVE" : "AVAILABLE"}
            </span>
          </div>
          <div className="mt-3 overflow-x-auto pb-1">
            <nav className="flex w-max gap-2">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href;
                return (
                  <a
                    key={`mobile-${item.href}`}
                    href={item.href}
                    className={`flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-xs font-bold transition-all ${
                      active
                        ? "border-border bg-primary text-black shadow-[3px_3px_0px_0px_var(--shadow)]"
                        : "border-transparent bg-muted/60 text-muted-foreground"
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="hidden items-center justify-between border-b-2 border-border bg-card px-6 py-4 lg:flex">
          <div className="text-sm font-bold text-muted-foreground uppercase tracking-wide">Doctor Workspace</div>
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full border-2 border-border bg-primary text-xs font-bold text-primary-foreground">
              {userName.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-bold text-foreground">{userName}</span>
          </div>
        </div>
        <div className="w-full px-4 py-4 sm:px-5 sm:py-5 lg:px-10 lg:py-6">{children}</div>
      </main>
    </div>
  );
}
