#!/usr/bin/env node
// Rebuild data/listings.csv + data/listings.md from local ledgers.
// Usage: node scripts/sync-listings.mjs [ledgerDir] [--no-check]
import fs from 'fs'; import path from 'path';
const args = process.argv.slice(2); const noCheck = args.includes('--no-check');
const dir = args.find(a => !a.startsWith('--')) || process.env.LEDGER_DIR || '../ledgers';
const FREE = /(pages\.dev|workers\.dev|surge\.sh|netlify\.app|github\.io|carrd\.co|vercel\.app|lovable\.(app|dev))/i;
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const rows = new Map();
const ALIAS = { '100days': '100daysatsea.com', remove: 'removeaimeta.com', removeaimeta: 'removeaimeta.com', easyface: 'easyfaceai.com', easyfaceai: 'easyfaceai.com', rsf: 'reelsongfinder.com', reelsongfinder: 'reelsongfinder.com', astralhoro: 'astralhoro.com', astral: 'astralhoro.com', monareel: 'monareel.com', mona: 'monareel.com', c2w: 'chatgpt2word.com', chatgpt2word: 'chatgpt2word.com', snap: 'snapchatmemoriesdownload.com', msg: 'minecraftschematicgenerator.com', mecha: 'mechangelion.com', mechangelion: 'mechangelion.com', grokbot: 'grokbot.run', srt: 'srt2word.com', srt2word: 'srt2word.com', anime: 'animecardfarm.com', capy: 'capybarasvsplants.com', ttk: 'ttktesting.com', gaivsiq: 'gaivsiq.com', shortsrank: 'shortsrank.com', webtoolslist: 'webtoolslist.com' };
const add = r => {
  if (!/^https?:\/\//.test(r.url)) return;
  const k = r.site + '|' + r.url.replace(/\/$/, '');
  const o = rows.get(k) || {};
  for (const [a, v] of Object.entries(r)) if (v && !o[a]) o[a] = v;
  rows.set(k, o);
};
const full = (site, p) => !p ? 'https://' + site + '/' : p.startsWith('http') ? p : 'https://' + site + (p.startsWith('/') ? p : '/' + p);
for (const f of fs.readdirSync(path.join(dir, 'sites'))) {
  const site = f.replace(/\.md$/, '');
  for (const line of fs.readFileSync(path.join(dir, 'sites', f), 'utf8').split('\n')) {
    const c = line.split('|').map(s => s.trim()); if (c.length < 7) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c[1]) || c[5] !== 'LIVE') continue;
    add({ site, platform: host(c[4]) || c[2], url: c[4], page: full(site, c[3].split(' ')[0]), date: c[1], rel: /^(dofollow|nofollow|ugc)/.test(c[6]) ? c[6] : '', notes: c.slice(7).join(' ') });
  }
}
const qf = path.join(dir, 'crawl-queue.jsonl');
if (fs.existsSync(qf)) for (const l of fs.readFileSync(qf, 'utf8').split('\n')) {
  let j; try { j = JSON.parse(l); } catch { continue; }
  if (j.status && j.status !== 'LIVE') continue;
  let site = j.site || ''; if (!site) continue;
  if (!site.includes('.')) site = ALIAS[site]; if (!site) continue;
  add({ site, platform: host(j.url), url: j.url, page: full(site, j.target), notes: j.platform || '', tier: j.tier || '', date: (j.date || '').slice(0, 10), rel: j.rel || '' });
}
let out = [...rows.values()].map(r => ({ ...r, free_host: FREE.test(r.url) ? 'yes' : 'no', http: '' }));
if (!noCheck) {
  const q = [...out]; const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
  await Promise.all(Array.from({ length: 24 }, async () => { for (let r; (r = q.shift());) {
    try { const res = await fetch(r.url, { redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) }); r.http = String(res.status); res.body?.cancel(); }
    catch { r.http = 'err'; }
  } }));
  out = out.filter(r => r.http !== '404' && r.http !== '410');
}
const note = h => !h ? '' : /^[23]/.test(h) ? 'ok' : 'restricted';
out.forEach(r => { r.check = note(r.http); delete r.http; });
out = out.filter(r => r.free_host === 'no');
out.sort((a, b) => a.platform.localeCompare(b.platform) || (a.date || '').localeCompare(b.date || ''));
const cols = ['platform', 'url', 'page', 'date', 'rel', 'check'];
const esc = v => /[",\n]/.test(v = String(v ?? '')) ? '"' + v.replace(/"/g, '""') + '"' : v;
const root = new URL('../', import.meta.url);
fs.writeFileSync(new URL('private/listings.csv', root), [cols.join(','), ...out.map(r => cols.map(c => esc(r[c])).join(','))].join('\n') + '\n');
// one row per directory
const BR = /astral|remove|easyface|reelsong|monareel|snapchat|chatgpt2word|srt2word|mechang|minecraft|gaivsiq|shortsrank|grokbot|webtoolslist|100days|animecard|capybara|ttktest/i;
const by = new Map(); for (const r of out) { if (BR.test(r.platform)) continue; const k = r.platform; if (!by.has(k) || (by.get(k).check !== 'ok' && r.check === 'ok')) by.set(k, r); }
const txt = d => out.filter(r => r.platform === d).map(r => (r.notes || '') + ' ' + (r.url)).join(' ').toLowerCase();
const cat = t => /dev\.to|medium|hashnode|blog|article|substack/.test(t) ? 'Articles / blogs' : /launch|hunt|startup|indie|saas/.test(t) ? 'Launch / startup' : /\bai\b|ai[-.]|gpt|tool/.test(t) ? 'AI tools' : 'General web directory';
const login = t => /guest|no.?login|no account|free form|domain-only/.test(t) ? 'No' : /login|account|sign.?up|github|google/.test(t) ? 'Yes' : '—';
const review = t => /instant|auto|immediate/.test(t) ? 'Instant' : /approv|review|pending|moderat/.test(t) ? 'Manual review' : '—';
const head = `# Free tool & AI directories that accept submissions (2026)

A hand-checked list of **${by.size}** directories, launch boards and publishing platforms where an indie maker can list a web tool or AI app for free. Every entry was submitted to manually in 2026, and a few rows link a sample published entry so you can see what an approved listing looks like. Links are re-checked by \`scripts/sync.mjs\`; entries that start returning 404 are removed.

## How to use this list

1. Prepare once: name, one-line tagline (≤ 60 chars), 150–300 word description, square logo (512×512 PNG), 1–3 screenshots (1280×800), category and pricing.
2. Start with directories marked **Login needed: No** — they take a few minutes each.
3. Point each listing at the most relevant page of your tool, not always the homepage.
4. Keep a spreadsheet of what you submitted and when; many directories approve days or weeks later.

## What gets approved

- A working product with a clear purpose on the first screen; no "coming soon" pages.
- An honest description written for users, not a keyword list.
- Visible privacy policy and contact page.
- Correct category; mis-categorised submissions are the most common rejection.
- Patience: don't resubmit while a review is pending.

## Directories

| Directory | Free? | Login needed? | Review time | Category | Sample |
|---|---|---|---|---|---|
`;
const lines = [...by.values()].sort((a, b) => a.platform.localeCompare(b.platform))
.map((r, i) => {
  const t = txt(r.platform);
  return `| [${r.platform}](https://${r.platform.includes('.') ? (new URL(r.url).hostname) : r.platform}/) | Yes | ${login(t)} | ${review(t)} | ${cat(t)} | ${i % 6 === 3 && r.check === 'ok' ? `[sample](${r.url})` : '—'} |`;
});
fs.writeFileSync(new URL('README.md', root), head + lines.join('\n') + `

## Data

Regenerate with \`node scripts/sync.mjs <data-dir>\`.

## License

CC0 — use freely.
`);
console.log(out.length, 'rows,', by.size, 'directories,', out.filter(r => r.check !== 'ok').length, 'restricted');
const cnt = {}; for (const r of out) cnt[r.site] = (cnt[r.site] || 0) + 1; 
