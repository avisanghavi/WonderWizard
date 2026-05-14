// LabBuddy — Stock supply image lookup.
//
// Drop image files into server/data/stock-images/ and they become available
// to the supply-strip / step illustrations as authoritative references.
//
// Naming convention:
//   - Filename (sans extension) is the lookup key. Spaces, hyphens, and
//     underscores are interchangeable. Case-insensitive.
//   - Synonyms can be added in `aliases` below.
//   - Allowed extensions: .png, .jpg, .jpeg, .svg, .webp
//
// Examples that work:
//   rubber-band.png        → matches "rubber band", "rubber bands", "rubberbands"
//   paper_cup.jpg          → matches "paper cup", "paper cups", "paper-cup"
//   shoebox.png            → matches "shoebox", "shoe box"
//
// At startup we index everything in the directory once. Hot-reloading the
// directory at runtime isn't supported — restart the server to pick up new
// files. Cheap and predictable.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STOCK_DIR = path.resolve(__dirname, "../../data/stock-images");

interface StockImage {
  /** Absolute file path on disk */
  filePath: string;
  /** Public URL served by /api/images/stock/:filename */
  url: string;
  /** Original filename incl. extension */
  filename: string;
}

const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".svg", ".webp"]);

/**
 * Manually-curated aliases. Add entries when a common supply name doesn't
 * line up with how an illustrator would name a file.
 */
const aliases: Record<string, string> = {
  "rubber bands": "rubber band",
  "paper cups": "paper cup",
  "shoe box": "shoebox",
  "popsicle stick": "craft stick",
  "tin foil": "aluminum foil",
};

/**
 * Normalize a supply name for lookup:
 *   "  Rubber Bands! (red) " → "rubber band"
 *   "Paper-Cups"             → "paper cup"
 */
function normalize(name: string): string {
  let s = name.toLowerCase().trim();
  // Strip parens, brackets, punctuation
  s = s.replace(/[()\\[\\]{}.,!?]/g, "");
  // Spaces/hyphens/underscores all collapse to a single space
  s = s.replace(/[\s_-]+/g, " ").trim();
  // Drop common quantity suffixes
  s = s.replace(/\b(small|medium|large|big|tiny|red|blue|green|yellow|white|black)\b/g, "").trim();
  // De-pluralize trivially (rubber bands → rubber band)
  s = s.replace(/s\b/, "");
  return aliases[s] ?? s;
}

// Build the index once on import.
const INDEX = new Map<string, StockImage>();

(function buildIndex() {
  if (!fs.existsSync(STOCK_DIR)) {
    console.log(`[stock-images] no stock image directory at ${STOCK_DIR} — skipping`);
    return;
  }
  let count = 0;
  for (const file of fs.readdirSync(STOCK_DIR)) {
    const ext = path.extname(file).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) continue;
    const base = file.slice(0, -ext.length);
    const key = normalize(base);
    if (!key) continue;
    INDEX.set(key, {
      filePath: path.join(STOCK_DIR, file),
      url: `/api/images/stock/${encodeURIComponent(file)}`,
      filename: file,
    });
    count += 1;
  }
  if (count > 0) console.log(`[stock-images] indexed ${count} stock images from ${STOCK_DIR}`);
})();

/** Look up the best stock image for a supply name. Returns undefined if no match. */
export function findStockImage(supplyName: string): StockImage | undefined {
  const key = normalize(supplyName);
  if (INDEX.has(key)) return INDEX.get(key);
  // Fuzzy second pass: try without de-pluralization differences, and try the
  // last word alone ("yellow rubber band" → "band").
  const words = key.split(" ");
  if (words.length > 1) {
    const lastWord = words[words.length - 1];
    if (INDEX.has(lastWord)) return INDEX.get(lastWord);
  }
  return undefined;
}

/** Public route helper — serve a stock image file by name. */
export function readStockFile(filename: string): { buffer: Buffer; mime: string } | null {
  // Whitelist: alphanumerics, dot, dash, underscore, space — and one of the
  // allowed extensions. No path separators.
  if (!/^[A-Za-z0-9 _\-.]+\.(png|jpg|jpeg|svg|webp)$/i.test(filename)) return null;
  const full = path.join(STOCK_DIR, filename);
  if (!full.startsWith(STOCK_DIR)) return null; // defense-in-depth
  if (!fs.existsSync(full)) return null;
  const ext = path.extname(filename).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" :
    ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
    ext === ".svg" ? "image/svg+xml" :
    ext === ".webp" ? "image/webp" : "application/octet-stream";
  return { buffer: fs.readFileSync(full), mime };
}
