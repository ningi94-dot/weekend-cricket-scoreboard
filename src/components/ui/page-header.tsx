export function PageHeader({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return <div className="mb-6"><p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">{eyebrow}</p><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>{description && <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">{description}</p>}</div>;
}
