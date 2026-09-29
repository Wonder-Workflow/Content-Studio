import Link from "next/link";
import { quietButtonClass } from "@/components/styles";

export default function ClientNotFound() {
  return (
    <div className="max-w-lg">
      <h1 className="font-display text-3xl tracking-tight">Client not found</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        That board is not in this studio, or the link is wrong.
      </p>
      <Link className={`${quietButtonClass} mt-6`} href="/studio">
        Back to clients
      </Link>
    </div>
  );
}
