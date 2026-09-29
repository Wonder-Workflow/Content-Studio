import { notFound } from "next/navigation";
import { CalendarBoard } from "@/components/calendar-board";
import { monthBounds, parseMonthKey } from "@/lib/calendar";
import { getClientBySlug, listPostsForMonth } from "@/lib/data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  return { title: client ? `${client.name} calendar` : "Calendar" };
}

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const monthParam = Array.isArray(query.month) ? query.month[0] : query.month;
  const month = parseMonthKey(monthParam);
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const bounds = monthBounds(month.year, month.monthIndex);
  const posts = await listPostsForMonth(client.id, bounds.start, bounds.end);

  return (
    <CalendarBoard
      clientId={client.id}
      clientName={client.name}
      slug={client.slug}
      year={month.year}
      monthIndex={month.monthIndex}
      monthKey={month.key}
      posts={posts}
    />
  );
}
