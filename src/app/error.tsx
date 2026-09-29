"use client";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col justify-center px-6">
      <h1 className="font-display text-3xl tracking-tight">Something went wrong</h1>
      <p className="mt-3 text-sm leading-6 text-ink-soft">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 self-start rounded-md bg-ink px-3.5 py-2 text-sm text-paper"
      >
        Try again
      </button>
    </main>
  );
}
