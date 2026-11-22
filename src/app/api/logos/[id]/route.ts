import { getOrganizationWebsite } from "@/server/services/organizations";
import { getLogo, logosEnabled } from "@/server/services/logos";
import { websiteHost } from "@/lib/org-grouping";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function miss(maxAge: number) {
  // The UI falls back to letter avatars on any error status.
  return new Response(null, { status: 404, headers: { "cache-control": `private, max-age=${maxAge}`, "x-content-type-options": "nosniff" } });
}

/**
 * GET /api/logos/:organizationId — the organization's favicon, fetched server-side from its website domain and cached
 * on disk. 404 when the organization has no usable website, when no icon was found, or when LOGOS=off.
 * The client appends ?v=<hash of the website> so a changed website busts the browser cache.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id) || !logosEnabled()) return miss(300);
  try {
    const host = websiteHost(await getOrganizationWebsite(id));
    if (!host) return miss(3600);
    const logo = await getLogo(host);
    if (!logo) return miss(86_400);
    return new Response(new Uint8Array(logo.body), {
      headers: {
        "content-type": logo.contentType,
        "content-length": String(logo.body.byteLength),
        "cache-control": "private, max-age=604800, stale-while-revalidate=2592000",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        "cross-origin-resource-policy": "same-origin",
      },
    });
  } catch {
    return miss(60);
  }
}
