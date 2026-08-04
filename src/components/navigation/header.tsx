import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3" aria-label="Let's Play Cricket home">
          <span className="grid size-9 place-items-center rounded-lg bg-[var(--brand)] text-sm font-black text-white" aria-hidden>LPC</span>
          <span>
            <strong className="block text-sm leading-none">Let&apos;s Play</strong>
            <span className="text-xs text-[var(--muted)]">Cricket</span>
          </span>
        </Link>
      </div>
    </header>
  );
}
