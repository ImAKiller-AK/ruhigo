// Builds Worldsmith from src/ into dist/.
//   dist/worldsmith.html  the page as published on claude.ai (no <html>/<head>/<body>: the host adds them)
//   dist/preview.html     the same page wrapped in a full document, to open directly in a browser
// Usage: node scripts/build.mjs [--check]   (--check fails if dist/worldsmith.html is out of date)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

export function buildPage() {
  const tpl = read("src/page.html");
  const css = read("src/styles.css");
  const js = fs.readdirSync(path.join(root, "src/js"))
    .filter((f) => f.endsWith(".js"))
    .sort() // files are numbered: their order is the order of the script
    .map((f) => read("src/js/" + f))
    .join("");
  const once = (s, marker, body) => {
    const n = s.split(marker).length - 1;
    if (n !== 1) throw new Error(`src/page.html must contain "${marker}" exactly once (found ${n})`);
    return s.replace(marker + "\n", () => body);
  };
  return once(once(tpl, "/* @inline styles.css */", css), "/* @inline js */", js);
}

// The document skeleton claude.ai wraps a published page in, plus a stand-in for the page runtime so the
// Minecraft export can save files when the preview is opened straight from disk.
const SKELETON_HEAD = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n';
const LOCAL_RUNTIME = '<script>/* local preview only: stands in for the claude.ai "downloads" capability */\n' +
  'window.claude=window.claude||{use:async n=>n==="downloads"?{save:async({filename,data})=>{const a=document.createElement("a");a.href=URL.createObjectURL(data);a.download=filename;document.body.appendChild(a);a.click();a.remove();return {status:"saved"};}}:null};\n</script>\n';

export function buildPreview(page) {
  return SKELETON_HEAD + LOCAL_RUNTIME + page + "</body></html>";
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const page = buildPage();
  const out = path.join(root, "dist/worldsmith.html");
  if (process.argv.includes("--check")) {
    const cur = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
    if (cur !== page) { console.error("dist/worldsmith.html is out of date: run npm run build"); process.exit(1); }
    console.log("dist/worldsmith.html is up to date");
  } else {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, page);
    fs.writeFileSync(path.join(root, "dist/preview.html"), buildPreview(page));
    console.log(`built dist/worldsmith.html (${(page.length / 1024).toFixed(1)} KB) and dist/preview.html`);
  }
}
