export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-5 py-10 text-center"><p className="font-bold">{title}</p><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">{description}</p></div>;
}
