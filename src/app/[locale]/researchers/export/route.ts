// The CSV export is locale-independent; serve the same handler under the
// locale prefix (/fr/researchers/export) as at /researchers/export.
export { GET } from "@/app/researchers/export/route";

export const dynamic = "force-dynamic";
