export function SectionStub({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-dashed border-line bg-paper-2 px-5 py-8 sm:px-8">
      <p className="font-display text-xs uppercase tracking-[0.16em] text-gold">
        {kicker}
      </p>
      <h2 className="mt-3 font-display text-2xl tracking-tight">{title}</h2>
      <div className="mt-3 max-w-2xl text-sm leading-6 text-ink-soft">{children}</div>
    </section>
  );
}
