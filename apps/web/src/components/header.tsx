"use client";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
  const pathname = usePathname();
  const links: Array<{ to: Route; label: string }> = [
    { to: "/landing" as Route, label: "Home" },
    { to: "/dashboard" as Route, label: "Dashboard" },
  ];

  if (pathname.startsWith("/landing")) {
    return null;
  }

  return (
    <header className="border-b-2 border-border bg-card">
      <div className="flex w-full items-center justify-between px-3 py-2 sm:px-5 sm:py-3 lg:px-8">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6">
          <Link href={"/landing" as Route} className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg border-2 border-border bg-primary text-base font-black text-primary-foreground shadow-[2px_2px_0px_0px_var(--shadow)] sm:size-10 sm:text-lg">
              S
            </div>
            <span className="hidden font-heading text-xl font-bold tracking-tight text-foreground sm:inline">
              SANJEEVNI
            </span>
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {links.map(({ to, label }) => {
              return (
                <Link
                  key={to}
                  href={to}
                  className="rounded-lg px-3 py-1.5 text-sm font-bold text-foreground transition-colors hover:bg-muted hover:underline decoration-2 underline-offset-4"
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ModeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
