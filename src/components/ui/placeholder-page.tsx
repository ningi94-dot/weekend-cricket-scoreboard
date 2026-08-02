import { PageHeader } from "@/components/ui/page-header";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return <section><PageHeader eyebrow="Coming soon" title={title} description={description} /><div className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-6 text-sm text-[var(--muted)]">This area is ready for the next build phase.</div></section>;
}
