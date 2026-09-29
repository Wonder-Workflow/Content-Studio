import type { PostStatus } from "@/lib/posts";

export function statusClass(status: PostStatus): string {
  switch (status) {
    case "idea":
      return "bg-status-idea text-ink";
    case "in-creation":
      return "bg-status-creating text-ink";
    case "ready":
      return "bg-status-ready text-paper";
    case "published":
      return "bg-ink text-paper";
  }
}
