"use client";

import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function signInWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");
    try {
      const { error } = await getSupabaseBrowserClient().auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/dashboard` } });
      setMessage(error ? error.message : "Check your email for your secure sign-in link.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to start sign-in."); }
    setIsLoading(false);
  }

  async function signInWithGoogle() {
    setIsLoading(true);
    try {
      const { error } = await getSupabaseBrowserClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/dashboard` } });
      if (error) setMessage(error.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to start Google sign-in."); setIsLoading(false); }
  }

  return <div className="mx-auto max-w-md rounded-3xl border border-[var(--line)] bg-white p-5 sm:p-7"><button onClick={signInWithGoogle} disabled={isLoading} className="min-h-12 w-full rounded-xl border border-[var(--line)] text-sm font-bold disabled:opacity-60">Continue with Google</button><div className="my-5 flex items-center gap-3 text-xs text-[var(--muted)]"><span className="h-px flex-1 bg-[var(--line)]" />or<span className="h-px flex-1 bg-[var(--line)]" /></div><form onSubmit={signInWithEmail}><label className="block text-sm font-semibold">Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="mt-1.5 min-h-12 w-full rounded-xl border border-[var(--line)] px-3 font-normal outline-none focus:border-[var(--brand)]" /></label><button disabled={isLoading} className="mt-4 min-h-12 w-full rounded-xl bg-[var(--brand)] text-sm font-bold text-white disabled:opacity-60">Email me a sign-in link</button></form>{message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-[var(--brand-dark)]">{message}</p>}<p className="mt-5 text-center text-xs leading-5 text-[var(--muted)]">Players can view the shared scoreboard. Captains and admins can manage squads and matches.</p></div>;
}
