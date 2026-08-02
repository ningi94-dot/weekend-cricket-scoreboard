"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/matches", label: "Matches", icon: "◉" },
  { href: "/players", label: "Players", icon: "♙" },
];

export function BottomNavigation() {
  const pathname = usePathname();
  return <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-5xl border-t border-[var(--line)] bg-white px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
    {items.map((item) => {
      const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
      return <Link key={item.href} href={item.href} className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-xs ${active ? "bg-emerald-50 font-semibold text-[var(--brand)]" : "text-[var(--muted)]"}`}>
        <span className="text-lg leading-none" aria-hidden>{item.icon}</span>{item.label}
      </Link>;
    })}
  </nav>;
}
