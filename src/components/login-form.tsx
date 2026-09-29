"use client";

import { useActionState, useState } from "react";
import { authenticate, type AuthFormState } from "@/app/login/actions";
import { buttonClass, inputClass } from "@/components/styles";

const initialState: AuthFormState = { error: null, message: null };

const modes = [
  { id: "signin", label: "Password" },
  { id: "magic", label: "Magic link" },
  { id: "signup", label: "Create account" },
] as const;

type Mode = (typeof modes)[number]["id"];

export function LoginForm({
  notice,
  initialMode = "signin",
}: {
  notice?: string | null;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [state, action, pending] = useActionState(authenticate, initialState);
  const needsPassword = mode !== "magic";

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="intent" value={mode} />
      <div className="grid grid-cols-3 gap-1 rounded-md bg-paper p-1">
        {modes.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setMode(item.id)}
            className={`rounded px-2 py-1.5 text-xs font-medium transition ${
              mode === item.id
                ? "bg-paper-2 text-ink shadow-sm"
                : "text-muted hover:text-ink"
            }`}
            aria-pressed={mode === item.id}
          >
            {item.label}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Email</span>
        <input
          className={inputClass}
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@studio.com"
        />
      </label>

      {needsPassword ? (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Password</span>
          <input
            className={inputClass}
            type="password"
            name="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={6}
            required
          />
        </label>
      ) : (
        <p className="text-sm leading-6 text-muted">
          We email you a one-time link. Open it in this browser.
        </p>
      )}

      {notice ? (
        <p role="alert" className="text-sm text-danger">
          {notice}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="text-sm text-ink-soft">
          {state.message}
        </p>
      ) : null}

      <button className={buttonClass} type="submit" disabled={pending}>
        {pending
          ? "Working…"
          : mode === "magic"
            ? "Email me a link"
            : mode === "signup"
              ? "Create account"
              : "Sign in"}
      </button>
    </form>
  );
}
