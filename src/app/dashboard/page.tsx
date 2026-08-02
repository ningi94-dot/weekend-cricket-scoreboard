import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";

const actions = [{ href: "/matches", label: "Create a match", detail: "Set up the next fixture" }, { href: "/players", label: "Manage players", detail: "Build your squad" }, { href: "/history", label: "View match history", detail: "Browse past scorecards" }];
export default function DashboardPage() { return <section><PageHeader eyebrow="Your clubhouse" title="Dashboard" description="Start a match, prepare your squad, or revisit a memorable innings." /><div className="grid gap-3 sm:grid-cols-3">{actions.map((action) => <Link key={action.href} href={action.href} className="rounded-2xl border border-[var(--line)] bg-white p-5 transition hover:border-emerald-300 hover:shadow-sm"><h2 className="font-bold text-[var(--brand-dark)]">{action.label} →</h2><p className="mt-2 text-sm text-[var(--muted)]">{action.detail}</p></Link>)}</div></section>; }
