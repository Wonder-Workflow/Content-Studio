import { buildGhlCsv, type GhlCsvPost } from "@/lib/ghl-csv";
import {
  getClientBySlug,
  getCurrentAgency,
  listClientPosts,
  listMediaForPosts,
  signedMediaUrls,
} from "@/lib/data";
import { SIGNED_URL_SECONDS } from "@/lib/media";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const agency = await getCurrentAgency();
  if (!agency) {
    return new Response("Sign in before downloading the CSV.", { status: 401 });
  }

  const client = await getClientBySlug(slug);
  if (!client) {
    return new Response("Not found", { status: 404 });
  }

  const posts = await listClientPosts(client.id);
  const media = await listMediaForPosts(posts.map((post) => post.id));
  let urls: Map<string, string>;
  try {
    urls = await signedMediaUrls(
      media.map((item) => item.storage_path),
      SIGNED_URL_SECONDS,
    );
  } catch {
    return new Response("Could not create image links. Try the download again.", {
      status: 500,
    });
  }

  if (media.some((item) => !urls.has(item.storage_path))) {
    return new Response("Could not create image links. Try the download again.", {
      status: 500,
    });
  }

  const rows: GhlCsvPost[] = posts.map((post) => ({
    startsOn: post.starts_on,
    caption: post.pack.caption,
    format: post.format,
    platform: post.platform,
    media: media
      .filter((item) => item.post_id === post.id)
      .map((item) => ({
        kind: item.kind,
        position: item.position,
        url: urls.get(item.storage_path) ?? "",
      })),
  }));

  return new Response(buildGhlCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${client.slug}-ghl.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
