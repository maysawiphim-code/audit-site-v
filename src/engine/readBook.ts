/* อ่านไฟล์ .xls / .xlsx ในเบราว์เซอร์: ค่าในเซลล์ กล่องข้อความ และแหล่งข้อมูลของกราฟ */
import * as XLSX from "xlsx";
import * as CFB from "cfb";
import { Book, CV, ChartInfo, Area, parseRef } from "./core";

export interface LoadedFile { name: string; book: Book; }

export function readBook(bytes: Uint8Array): Book {
  const wb = XLSX.read(bytes, { type: "array" });
  const book: Book = { names: [], grids: new Map(), texts: new Map(), charts: new Map() };
  wb.SheetNames.forEach((name) => {
    const ws = wb.Sheets[name];
    book.names.push(name);
    let grid: CV[][] = [];
    if (ws && ws["!ref"]) {
      const rg = XLSX.utils.decode_range(ws["!ref"]);
      rg.s.r = 0; rg.s.c = 0;
      grid = XLSX.utils.sheet_to_json<CV[]>(ws, { header: 1, raw: true, defval: "", range: rg, blankrows: true });
    }
    book.grids.set(name, grid);
  });
  const extra = extractShapes(bytes);
  extra.texts.forEach((v, k) => book.texts.set(k, v));
  extra.charts.forEach((v, k) => book.charts.set(k, v));
  return book;
}

function extractShapes(u8: Uint8Array): { texts: Map<string, string[]>; charts: Map<string, ChartInfo[]> } {
  const texts = new Map<string, string[]>();
  const charts = new Map<string, ChartInfo[]>();
  const push = <T,>(m: Map<string, T[]>, k: string, v: T) => { const a = m.get(k) || []; a.push(v); m.set(k, a); };
  const isZip = u8[0] === 0x50 && u8[1] === 0x4b;
  try { if (isZip) fromXlsx(); else fromXls(); } catch (e) { /* อ่านกล่องข้อความไม่ได้ ตรวจเฉพาะเซลล์ */ }
  return { texts, charts };

  function fromXls() {
    const cfb = CFB.read(u8, { type: "array" });
    const ent = CFB.find(cfb, "Workbook") || CFB.find(cfb, "Book");
    if (!ent || !ent.content) return;
    const d = ent.content as unknown as Uint8Array, len = d.length;
    const u16 = (p: number) => d[p] | (d[p + 1] << 8);
    const u32 = (p: number) => (d[p] | (d[p + 1] << 8) | (d[p + 2] << 16)) + d[p + 3] * 16777216;
    const sheetAt = new Map<number, string>(); const order: string[] = []; const xti: number[] = [];
    let pos = 0;
    while (pos + 4 <= len) {
      const t = u16(pos), l = u16(pos + 2), p = pos + 4;
      if (t === 0x0085) {
        const off = u32(p), cch = d[p + 6], fl = d[p + 7]; let name = "";
        for (let i = 0; i < cch; i++) name += String.fromCharCode(fl & 1 ? u16(p + 8 + i * 2) : d[p + 8 + i]);
        sheetAt.set(off, name); order.push(name);
      }
      if (t === 0x0017) { const n = u16(p); for (let i = 0; i < n; i++) xti.push(u16(p + 2 + i * 6 + 2)); }
      if (t === 0x000a) break;
      pos = p + l;
    }
    pos = 0;
    let cur = "", chart: ChartInfo | null = null, ser: { cat: Area[] | null; val: Area[] | null; cache: number[] } | null = null;
    while (pos + 4 <= len) {
      const t = u16(pos), l = u16(pos + 2), p = pos + 4;
      if (t === 0x0809) {
        const nm = sheetAt.get(pos);
        if (nm) cur = nm;
        else if (u16(p + 2) === 0x0020 && cur) { chart = { title: "", series: [] }; push(charts, cur, chart); }
      }
      if (t === 0x000a && chart) { chart = null; ser = null; }
      if (chart && t === 0x1003) { ser = { cat: null, val: null, cache: [] }; chart.series.push(ser); }
      if (chart && ser && t === 0x1051) {
        const id = d[p], cce = u16(p + 6); let k = p + 8; const end = k + cce; const areas: Area[] = [];
        while (k < end) {
          const tok = d[k];
          if (tok === 0x3b || tok === 0x5b || tok === 0x7b) { areas.push({ sheet: order[xti[u16(k + 1)]], r1: u16(k + 3), r2: u16(k + 5), c1: u16(k + 7) & 0x3fff, c2: u16(k + 9) & 0x3fff }); k += 11; }
          else if (tok === 0x3a || tok === 0x5a || tok === 0x7a) { const r = u16(k + 3), c = u16(k + 5) & 0x3fff; areas.push({ sheet: order[xti[u16(k + 1)]], r1: r, r2: r, c1: c, c2: c }); k += 7; }
          else if (tok === 0x10 || tok === 0x15) k += 1;
          else if (tok === 0x29 || tok === 0x49 || tok === 0x69) k += 3;
          else break;
        }
        if (id === 1) ser.val = areas; else if (id === 2) ser.cat = areas;
      }
      if (t === 0x01b6 && cur) {
        const want = u16(p + 10); let txt = ""; let q = p + l;
        while (txt.length < want && q + 4 <= len && u16(q) === 0x003c) {
          const cl = u16(q + 2), cp = q + 4, hi = d[cp] & 1; let k = cp + 1; const end = cp + cl;
          while (k < end && txt.length < want) { if (hi) { txt += String.fromCharCode(u16(k)); k += 2; } else { txt += String.fromCharCode(d[k]); k += 1; } }
          q = end;
        }
        if (txt.trim() && !chart) push(texts, cur, txt.replace(/\r\n?/g, "\n"));
        pos = q; continue;
      }
      pos = p + l;
    }
  }

  function fromXlsx() {
    const cfb = CFB.read(u8, { type: "array" });
    const dec = new TextDecoder("utf-8");
    const get = (path: string): string => {
      const e = CFB.find(cfb, path) || CFB.find(cfb, "/" + path);
      if (!e || !e.content) return "";
      return dec.decode(e.content as unknown as Uint8Array);
    };
    const unx = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
    const rels = (path: string): Map<string, string> => {
      const dir = path.replace(/[^/]*$/, ""), file = path.slice(dir.length), x = get(dir + "_rels/" + file + ".rels"), map = new Map<string, string>();
      const re = /<Relationship\b[^>]*>/g; let m: RegExpExecArray | null;
      while ((m = re.exec(x)) !== null) {
        const id = (m[0].match(/Id="([^"]+)"/) || [])[1], tg = (m[0].match(/Target="([^"]+)"/) || [])[1];
        if (!id || !tg) continue;
        const full = tg.charAt(0) === "/" ? tg.slice(1) : dir + tg; const parts: string[] = [];
        full.split("/").forEach((s) => { if (s === "..") parts.pop(); else if (s && s !== ".") parts.push(s); });
        map.set(id, parts.join("/"));
      }
      return map;
    };
    const wbx = get("xl/workbook.xml"), wr = rels("xl/workbook.xml");
    const re = /<sheet\b[^>]*>/g; let m: RegExpExecArray | null;
    while ((m = re.exec(wbx)) !== null) {
      const name = unx((m[0].match(/name="([^"]*)"/) || [])[1] || ""), rid = (m[0].match(/r:id="([^"]+)"/) || [])[1];
      const sp = rid ? wr.get(rid) : undefined; if (!sp) continue;
      const sx = get(sp), sr = rels(sp), dm = sx.match(/<drawing\b[^>]*r:id="([^"]+)"/);
      const dpath = dm ? sr.get(dm[1]) : undefined; if (!dpath) continue;
      const dx = get(dpath), drel = rels(dpath);
      const gre = /<c:chart\b[^>]*r:id="([^"]+)"/g; let gm: RegExpExecArray | null;
      while ((gm = gre.exec(dx)) !== null) {
        const cx = get(drel.get(gm[1]) || ""); if (!cx) continue;
        const ch: ChartInfo = { title: "", series: [] };
        const sre = /<c:ser>([\s\S]*?)<\/c:ser>/g; let sm: RegExpExecArray | null;
        while ((sm = sre.exec(cx)) !== null) {
          const body = sm[1];
          const part = (tag: string): Area[] | null => { const mm = body.match(new RegExp("<c:" + tag + ">([\\s\\S]*?)</c:" + tag + ">")); if (!mm) return null; const f = mm[1].match(/<c:f>([\s\S]*?)<\/c:f>/); return f ? parseRef(unx(f[1])) : null; };
          const cache: number[] = []; const vm = body.match(/<c:val>([\s\S]*?)<\/c:val>/);
          if (vm) { const pre = /<c:pt idx="(\d+)">\s*<c:v>([^<]*)<\/c:v>/g; let pm: RegExpExecArray | null; while ((pm = pre.exec(vm[1])) !== null) cache[parseInt(pm[1], 10)] = parseFloat(pm[2]); }
          ch.series.push({ cat: part("cat"), val: part("val"), cache: cache });
        }
        push(charts, name, ch);
      }
      const spre = /<xdr:sp\b[\s\S]*?<\/xdr:sp>/g; let spm: RegExpExecArray | null;
      while ((spm = spre.exec(dx)) !== null) {
        const paras: string[] = []; const pre = /<a:p>([\s\S]*?)<\/a:p>/g; let pm: RegExpExecArray | null;
        while ((pm = pre.exec(spm[0])) !== null) { let t = ""; const tre = /<a:t>([\s\S]*?)<\/a:t>/g; let tm: RegExpExecArray | null; while ((tm = tre.exec(pm[1])) !== null) t += unx(tm[1]); paras.push(t); }
        const txt = paras.join("\n"); if (txt.trim()) push(texts, name, txt);
      }
    }
  }
}
