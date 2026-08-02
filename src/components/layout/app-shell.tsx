import { BottomNavigation } from "@/components/navigation/bottom-navigation";
import { Header } from "@/components/navigation/header";

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto min-h-dvh max-w-5xl bg-[var(--background)]">
      <Header />
      <main className="px-4 pb-24 pt-5 sm:px-6">{children}</main>
      <BottomNavigation />
    </div>
  );
}
