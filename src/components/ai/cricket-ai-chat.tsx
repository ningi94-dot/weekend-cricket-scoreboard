"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { AiChatMessage } from "@/lib/ai/types";

export function CricketAiChat() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isRecordTab = /^\/matches\/[^/]+$/.test(pathname) && searchParams.get("tab") === "record";
  const matchId = useMemo(() => pathname.match(/^\/matches\/([^/]+)/)?.[1] ?? null, [pathname]);
  const [isOpen, setIsOpen] = useState(false);
  const [isCaptain, setIsCaptain] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const visibleOpen = isOpen && !isRecordTab;

  useEffect(() => {
    if (!visibleOpen) return;
    let isActive = true;
    fetch("/api/captain/me", { credentials: "include" })
      .then((response) => response.json())
      .then((body) => { if (isActive) setIsCaptain(Boolean(body?.isCaptain)); })
      .catch(() => { if (isActive) setIsCaptain(false); });
    return () => { isActive = false; };
  }, [visibleOpen]);

  useEffect(() => {
    if (!visibleOpen) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [visibleOpen, messages, isSending]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || isLoggingIn) return;
    setIsLoggingIn(true);
    setMessage("");
    try {
      const response = await fetch("/api/captain/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message ?? "Incorrect captain password.");
      setIsCaptain(true);
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function sendQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = question.trim();
    if (!content || isSending) return;
    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setQuestion("");
    setMessage("");
    setIsSending(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, context: { pathname, matchId } }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) setIsCaptain(false);
        throw new Error(body?.message ?? "Cricket AI is temporarily unavailable. Please try again.");
      }
      setMessages((current) => [...current, { role: "assistant", content: body?.answer ?? "I could not determine an answer from the stored data." }]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cricket AI is temporarily unavailable. Please try again.");
    } finally {
      setIsSending(false);
    }
  }

  if (isRecordTab) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={visibleOpen ? "Close Cricket AI" : "Open Cricket AI"}
        aria-expanded={visibleOpen}
        className="fixed bottom-20 right-4 z-30 grid size-12 place-items-center rounded-full bg-[var(--brand-dark)] text-xl font-black text-white shadow-lg ring-2 ring-white sm:right-[max(1.5rem,calc((100vw-64rem)/2+1.5rem))]"
      >
        {visibleOpen ? "×" : "✦"}
      </button>

      {visibleOpen && (
        <section className="fixed inset-x-3 bottom-36 z-30 flex max-h-[68dvh] min-h-80 flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-2xl sm:left-auto sm:right-[max(1.5rem,calc((100vw-64rem)/2+1.5rem))] sm:w-[24rem]" aria-label="Cricket AI chat">
          <header className="flex items-center justify-between gap-3 bg-[var(--brand-dark)] px-4 py-3 text-white">
            <div>
              <p className="font-black">Cricket AI</p>
              <p className="text-[11px] text-emerald-100">Read-only cricket statistics</p>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && <button type="button" onClick={() => { setMessages([]); setMessage(""); }} className="min-h-8 rounded-lg px-2 text-xs font-bold text-emerald-50">Clear</button>}
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Close Cricket AI" className="grid size-8 place-items-center rounded-lg text-xl">×</button>
            </div>
          </header>

          {isCaptain === null ? (
            <p className="p-4 text-sm text-[var(--muted)]">Checking access...</p>
          ) : !isCaptain ? (
            <form onSubmit={login} className="space-y-3 p-4">
              <p className="text-sm font-semibold">Captain login is required.</p>
              <label className="block text-sm font-bold">Captain password
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal" />
              </label>
              {message && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{message}</p>}
              <button type="submit" disabled={!password || isLoggingIn} className="min-h-11 w-full rounded-lg bg-[var(--brand)] px-4 text-sm font-black text-white disabled:opacity-50">{isLoggingIn ? "Signing in..." : "Login"}</button>
            </form>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
                {!messages.length && (
                  <div className="rounded-lg bg-emerald-50 p-3 text-sm text-[var(--brand-dark)]">
                    Ask about players, teams, tournaments, scorecards, or compare saved teams before a match.
                  </div>
                )}
                {messages.map((row, index) => (
                  <div key={`${row.role}-${index}`} className={`max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${row.role === "user" ? "ml-auto bg-[var(--brand)] text-white" : "bg-stone-100 text-stone-900"}`}>
                    {row.content}
                  </div>
                ))}
                {isSending && <div className="max-w-[90%] rounded-xl bg-stone-100 px-3 py-2 text-sm text-[var(--muted)]">Checking the scorebooks...</div>}
                {message && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{message}</p>}
              </div>
              <form onSubmit={sendQuestion} className="border-t border-[var(--line)] p-3">
                <label className="sr-only" htmlFor="cricket-ai-question">Ask Cricket AI</label>
                <div className="flex items-end gap-2">
                  <textarea id="cricket-ai-question" value={question} onChange={(event) => setQuestion(event.target.value.slice(0, 1200))} rows={2} placeholder="Ask a cricket question..." className="min-h-11 flex-1 resize-none rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
                  <button type="submit" disabled={!question.trim() || isSending} className="min-h-11 rounded-lg bg-[var(--brand)] px-4 text-sm font-black text-white disabled:opacity-50">Send</button>
                </div>
              </form>
            </>
          )}
        </section>
      )}
    </>
  );
}
