import { getOrganizationLogoInfo } from "@/server/services/organizations";
import { getLogo, getSvglLogo, logosEnabled } from "@/server/services/logos";
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
    const org = await getOrganizationLogoInfo(id);
    if (!org) return miss(3600);
    // Vector logo from SVGL when the brand is listed there, else the website's icon.
    const host = websiteHost(org.website);
    const logo = (await getSvglLogo(org.name)) ?? (host ? await getLogo(host) : null);
    if (!logo) return miss(host ? 86_400 : 3600);
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
