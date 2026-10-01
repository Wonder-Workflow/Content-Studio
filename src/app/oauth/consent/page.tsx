import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readDotConsent, readDotConsentConfig } from "@/lib/dot-consent";
import { decideConsent } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect Content Studio" };
export default async function ConsentPage({ searchParams }: {
  searchParams: Promise<{ authorization_id?: string; error?: string }>;
}) {
  const config = readDotConsentConfig(process.env);
  if (!config) notFound();
  const params = await searchParams;
  const client = await createClient();
  const details = params.error ? null : await readDotConsent(client, config, params.authorization_id ?? "");
  return <main className="mx-auto w-full max-w-md px-6 py-16">
    <h1 className="font-display text-3xl">Connect Content Studio</h1>
    {details ? <>
      <p className="mt-4">{details.client.name} is asking to connect as {details.user.email}.</p>
      <p className="mt-4">It can read, claim and finish art jobs you created, and save their complete image sets. Other team members’ jobs are excluded.</p>
      <p className="mt-4 text-sm">Requested identity information: {details.scope}.</p>
      <form action={decideConsent} className="mt-6 flex gap-4">
        <input type="hidden" name="authorization_id" value={details.authorization_id} />
        <button name="decision" value="approve" className="rounded border px-4 py-2">Allow connection</button>
        <button name="decision" value="deny" className="rounded border px-4 py-2">Deny</button>
      </form>
    </> : <>
      <p className="mt-4">This connection request is unavailable. Sign in to the approved owner account in another tab, return here and reload. If it still fails, restart the connection.</p>
      <Link href="/login" target="_blank" rel="noopener noreferrer" className="mt-6 inline-block underline">Sign in</Link>
    </>}
  </main>;
}
