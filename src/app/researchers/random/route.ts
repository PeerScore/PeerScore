import { redirect } from "next/navigation";
import { randomPublished } from "@/lib/repositories";

export const dynamic = "force-dynamic";

/** GET /researchers/random → a random published researcher (or the index when none). */
export async function GET() {
  const r = await randomPublished();
  redirect(r ? `/researchers/${r.slug}` : "/researchers");
}
