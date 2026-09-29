import Link from "next/link";
import { AddMemberForm } from "@/components/add-member-form";
import { CreateAgencyForm } from "@/components/create-agency-form";
import { CreateClientForm } from "@/components/create-client-form";
import { getCurrentAgency, listClients, listMembers } from "@/lib/data";

export const metadata = {
  title: "Studio",
};

export default async function StudioPage() {
  const agency = await getCurrentAgency();

  if (!agency) {
    return (
      <main className="max-w-lg">
        <p className="font-display text-xs uppercase tracking-[0.16em] text-gold">
          First step
        </p>
        <h1 className="mt-3 font-display text-4xl tracking-tight">
          Name your studio
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          This is the agency. People you add later see the same client boards.
          Seats are equal.
        </p>
        <div className="mt-8 rounded-lg border border-line bg-paper-2 p-5">
          <CreateAgencyForm />
        </div>
      </main>
    );
  }

  const [clients, members] = await Promise.all([
    listClients(agency.id),
    listMembers(agency.id),
  ]);

  return (
    <main className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section>
        <p className="font-display text-xs uppercase tracking-[0.16em] text-gold">
          Clients
        </p>
        <h1 className="mt-3 font-display text-4xl tracking-tight">{agency.name}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-ink-soft">
          Each client is a board. Calendar, packs, brand, and shot list are
          stubbed for now.
        </p>

        {clients.length === 0 ? (
          <div className="mt-8 rounded-lg border border-dashed border-line px-5 py-10">
            <h2 className="font-display text-2xl tracking-tight">No clients yet</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted">
              Add the first client to open a board. The name becomes the link,
              so “Harbor & Co.” turns into <span className="text-ink">harbor-co</span>.
            </p>
          </div>
        ) : (
          <ul className="mt-8 divide-y divide-line border-y border-line">
            {clients.map((client) => (
              <li key={client.id}>
                <Link
                  href={`/clients/${client.slug}`}
                  className="flex items-baseline justify-between gap-4 py-4 transition hover:text-gold"
                >
                  <span className="font-display text-xl tracking-tight">
                    {client.name}
                  </span>
                  <span className="text-xs uppercase tracking-wide text-muted">
                    {client.slug}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <div className="rounded-lg border border-line bg-paper-2 p-5">
          <h2 className="font-display text-lg tracking-tight">Add client</h2>
          <div className="mt-4">
            <CreateClientForm />
          </div>
        </div>
        <div className="rounded-lg border border-line bg-paper-2 p-5">
          <h2 className="font-display text-lg tracking-tight">Team</h2>
          <ul className="mt-3 space-y-1 text-sm text-ink-soft">
            {members.map((member) => (
              <li key={member.user_id}>{member.email || "Account without email"}</li>
            ))}
          </ul>
          <div className="mt-4">
            <AddMemberForm />
          </div>
        </div>
      </aside>
    </main>
  );
}
