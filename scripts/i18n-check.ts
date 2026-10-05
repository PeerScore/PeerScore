// Asserts every messages/<locale>.json has exactly the same key set as en.json
// and the same ICU arguments per message. Run with `npm run i18n:check`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LOCALES } from "../src/i18n/routing";

const dir = join(__dirname, "..", "messages");
type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}

/** ICU argument names and rich-text tags used by a message, e.g. {count} / <b>. */
function args(message: string): string {
  const names = new Set<string>();
  for (const m of message.matchAll(/\{\s*([A-Za-z0-9_]+)/g)) names.add(m[1]);
  for (const m of message.matchAll(/<([A-Za-z0-9_]+)>/g)) names.add(`<${m[1]}>`);
  return [...names].sort().join(",");
}

const load = (locale: string) => flatten(JSON.parse(readFileSync(join(dir, `${locale}.json`), "utf8")) as Tree);
const en = load("en");
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
let failed = false;

for (const locale of LOCALES) {
  if (!files.includes(locale)) {
    console.error(`${locale}: messages/${locale}.json is missing`);
    failed = true;
  }
}
for (const locale of files) {
  if (locale === "en") continue;
  if (!(LOCALES as readonly string[]).includes(locale)) {
    console.error(`${locale}: not listed in src/i18n/routing.ts`);
    failed = true;
  }
  const msgs = load(locale);
  const missing = [...en.keys()].filter((k) => !msgs.has(k));
  const extra = [...msgs.keys()].filter((k) => !en.has(k));
  const badArgs = [...en.keys()].filter((k) => msgs.has(k) && args(en.get(k)!) !== args(msgs.get(k)!));
  const empty = [...msgs.entries()].filter(([, v]) => !v.trim()).map(([k]) => k);
  if (missing.length || extra.length || badArgs.length || empty.length) {
    failed = true;
    console.error(`${locale}:`);
    if (missing.length) console.error(`  missing: ${missing.join(", ")}`);
    if (extra.length) console.error(`  extra: ${extra.join(", ")}`);
    if (badArgs.length) console.error(`  ICU arguments differ from en: ${badArgs.join(", ")}`);
    if (empty.length) console.error(`  empty: ${empty.join(", ")}`);
  }
}

if (failed) process.exit(1);
console.log(`i18n: ${files.length} locales, ${en.size} keys each — OK`);
