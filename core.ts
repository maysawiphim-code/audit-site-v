/* แกนตัวตรวจรายงานจับตัวเลข: คำนวณทุกอย่างจากข้อมูลในไฟล์ ไม่ใช้ AI */
// ---------------------------------------------------------------- types
export type CV = string | number | boolean;
export interface Area { sheet: string; r1: number; r2: number; c1: number; c2: number; }
export interface SeriesInfo { cat: Area[] | null; val: Area[] | null; cache: number[]; }
export interface ChartInfo { title: string; series: SeriesInfo[]; }
export interface Book { names: string[]; grids: Map<string, CV[][]>; texts: Map<string, string[]>; charts: Map<string, ChartInfo[]>; }
export interface Tbl { head: string[]; rows: string[][]; hl?: number; }
export interface Issue { rule: string; level: string; sheet: string; where: string; title: string; detail: string; table: Tbl | null; }
export interface Rule { id: string; name: string; sheet: string; checked: number; failed: number; bad: number; warn: number; }
interface BV { m: number; a: number; n: number; t: number; p: number | null; }
interface DRow { r: number; label: string; section: string; sub: string; v: BV[]; total: boolean; }
interface Sec { name: string; subs: Map<string, DRow[]>; subOrder: string[]; total: DRow | null; }
interface Block { m: number; a: number; n: number; t: number; p: number; name: string; }
interface TextItem { sheet: string; ref: string; text: string; map: boolean; cell: boolean; shape: boolean; }
export interface ChartFact { tag: string; range: string; col: string; n: number; }
export interface DayTotals { code: string; site: string; dates: string[]; backup: string; frontName: string; days: { p: number[]; front: number[]; }[]; }
export interface Facts { code: string; site: string; record: string; point: string; store: string; pattern: string; owner: string; backup: string; dates: string[]; charts: ChartFact[]; shapeCount: number; }
export interface DNote { side: number; sh: number; h: number; label: string; text: string; where: string; }
export interface DView { shift: number; rows: { h: number; time: string; p: number[]; c: number[]; pw: number[]; cw: number[]; pp: number; cp: number; overP: boolean; overC: boolean; notes: DNote[]; }[]; totP: number[]; totC: number[]; pp: number; cp: number; }
export interface DiffRes { sheet: string; site: string; code: string; dates: string[]; backup: string; notes: DNote[]; view: DView[]; dayTot: { p: number; c: number; pw: number; cw: number; }[]; }
export interface Res { rules: Map<string, Rule>; order: string[]; issues: Issue[]; facts: Facts; remarks: string[]; fatal: string; notes: string[]; dayTotals: DayTotals | null; diff: DiffRes | null; }

// ---------------------------------------------------------------- helpers
function S(v: CV | undefined | null): string { return v === undefined || v === null ? "" : String(v).replace(/ /g, " ").trim(); }
function norm(v: CV | undefined | null): string { return S(v).replace(/\s+/g, "").toLowerCase(); }
function isNum(v: CV | undefined | null): boolean { return typeof v === "number" || (typeof v === "string" && v.trim() !== "" && /^-?[\d,]+(\.\d+)?$/.test(v.trim())); }
function N(v: CV | undefined | null): number { if (typeof v === "number") return v; if (typeof v === "string" && isNum(v)) return parseFloat(v.replace(/,/g, "")); return 0; }
function close(a: number, b: number, t?: number): boolean { return Math.abs(a - b) <= (t === undefined ? 0.01 : t); }
function fmt(n: number): string { const r = Math.round(n * 100) / 100; const neg = r < 0; const s = Math.abs(r).toFixed(2).replace(/\.?0+$/, ""); const parts = s.split("."); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ","); return (neg ? "-" : "") + parts.join("."); }
function pc(p: number): string { return (p * 100).toFixed(2) + "%"; }
function pc1(p: number): string { return (p * 100).toFixed(1) + "%"; }
function esc(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function colL(c: number): string { let s = ""; let n = c + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function colN(s: string): number { let n = 0; for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n - 1; }
function ref(r: number, c: number): string { return colL(c) + (r + 1); }
function cell(A: CV[][], r: number, c: number): CV { const row = A[r]; if (!row) return ""; const v = row[c]; return v === undefined ? "" : v; }
function pdiff(a: number, b: number): number { return a + b === 0 ? 0 : Math.abs(b - a) / (a + b); }

export function parseRef(f: string): Area[] | null {
  if (!f) return null;
  const out: Area[] = [];
  f.replace(/^=/, "").replace(/^\(|\)$/g, "").split(",").forEach((a) => {
    const m = a.trim().match(/^'?(.*?)'?!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/);
    if (!m) return;
    const c1 = colN(m[2]), r1 = parseInt(m[3], 10) - 1;
    out.push({ sheet: m[1].replace(/''/g, "'"), c1: c1, r1: r1, c2: m[4] ? colN(m[4]) : c1, r2: m[5] ? parseInt(m[5], 10) - 1 : r1 });
  });
  return out.length ? out : null;
}

// ---------------------------------------------------------------- กฎ
const RULE_DEFS: string[][] = [
  ["shift", "เช้า + บ่าย + ดึก = รวมทั้งวัน", "data"],
  ["group", "ทุกหมวดรวมเท่ากับยอดรวม และ % ถูก", "data"],
  ["allcars", "รถทั้งหมด = ผลรวมทุกกลุ่มรถ และ % ของแต่ละกลุ่ม", "data"],
  ["avg", "ค่าเฉลี่ย = ค่าเฉลี่ยของทุกวัน", "data"],
  ["twoday", "แต่ละวันไม่ควรต่างกันเกิน 3 เท่า", "data"],
  ["sameday", "ยอดรวมแต่ละวันไม่ควรเท่ากันพอดี", "data"],
  ["header", "ข้อมูลหัวรายงานครบ", "data"],
  ["summary", "ตัวเลขและ % ในชีตสรุปตรงกับค่าเฉลี่ยใน data", "สรุป"],
  ["text", "ตัวเลขในข้อความสรุปและกล่องข้อความตรงกับตาราง", "สรุป, ทุกชีต"],
  ["map", "ตัวเลขและข้อความในชีตแผนที่ตรงกับ data", "แผนที่"],
  ["ranking", "คำว่า \"ส่วนใหญ่\" ตรงกับหมวดที่มากที่สุดจริง", "สรุป, แผนที่"],
  ["charts", "กราฟดึงข้อมูลครบทุกชั่วโมงจากคอลัมน์ที่ถูก", "สรุป, รายชั่วโมง"],
  ["wording", "คำว่า \"ไม่แตกต่างกัน\" ตรงกับสัดส่วนจริง", "สรุป, แผนที่"],
  ["peak", "ช่วงเวลาที่เขียนว่าคน/รถเยอะ ตรงกับรายชั่วโมง", "สรุป, กราฟ"],
  ["hourly", "รายชั่วโมงรวมเท่ากับยอดผลัดและยอดรวม", "กราฟ"],
  ["hourcols", "ตารางรายชั่วโมงมีครบทุกหมวดและตรงกับ data", "กราฟ"],
  ["toptable", "ตาราง % ด้านบนชีตกราฟตรงกับ data", "กราฟ"],
  ["naming", "ชื่อทำเลและปีตรงกับรอบนี้ทุกชีต", "ทุกชีต"],
  ["dhour", "ผลต่างรายชั่วโมง = เลขสะสมที่เพิ่มขึ้นของเครื่องนับ", "ผลต่าง"],
  ["dtotal", "ยอดรวมผลัดและยอดรวมทั้งวันถูก", "ผลต่าง"],
  ["dcmp", "จำนวนดิฟและ %diff ระหว่างสองวันถูก", "ผลต่าง"],
  ["dnote", "ชั่วโมงที่ดิฟเกินเกณฑ์มีหมายเหตุอธิบาย", "ผลต่าง"],
  ["ddata", "ยอดต่อผลัดตรงกับชีต data ของรายงาน", "ผลต่าง, data"]
];
export function newRes(): Res {
  const R: Res = { rules: new Map<string, Rule>(), order: [], issues: [], facts: { code: "", site: "", record: "", point: "", store: "", pattern: "", owner: "", backup: "", dates: [], charts: [], shapeCount: 0 }, remarks: [], fatal: "", notes: [], dayTotals: null, diff: null };
  RULE_DEFS.forEach((x) => { R.rules.set(x[0], { id: x[0], name: x[1], sheet: x[2], checked: 0, failed: 0, bad: 0, warn: 0 }); R.order.push(x[0]); });
  return R;
}
export function rl(R: Res, id: string): Rule { const r = R.rules.get(id); if (!r) throw new Error("rule " + id); return r; }
function check(R: Res, id: string, ok: boolean): boolean { const r = rl(R, id); r.checked++; if (!ok) r.failed++; return ok; }
function issue(R: Res, id: string, level: string, sheet: string, where: string, title: string, detail: string, table?: Tbl | null) {
  const r = rl(R, id); if (level === "bad") r.bad++; else r.warn++;
  R.issues.push({ rule: id, level: level, sheet: sheet, where: where, title: title, detail: detail, table: table ? table : null });
}

// ---------------------------------------------------------------- รายงาน
export function analyzeReport(book: Book): Res {
  const R = newRes();
  const SH = ["ผลัดเช้า", "ผลัดบ่าย", "ผลัดดึก", "รวมทั้งวัน"];
  const F: string[] = ["m", "a", "n", "t"];
  const fv = (v: BV, f: string): number => (f === "m" ? v.m : f === "a" ? v.a : f === "n" ? v.n : v.t);
  const sheetBy = (pred: (n: string) => boolean): string => { for (const n of book.names) if (pred(n)) return n; return ""; };
  const grid = (n: string): CV[][] => { const g = book.grids.get(n); return g ? g : []; };

  const dName = sheetBy((n) => norm(n) === "data") || sheetBy((n) => /data/i.test(n));
  if (!dName) { R.fatal = "ไม่พบชีตชื่อ data"; return R; }
  const A = grid(dName);
  let hdr = -1;
  for (let r = 0; r < A.length && hdr < 0; r++) for (let c = 0; c < A[r].length; c++) if (norm(A[r][c]) === "ผลัดเช้า") { hdr = r; break; }
  if (hdr < 0) { R.fatal = "ชีต data: ไม่พบหัวตาราง \"ผลัดเช้า\""; return R; }

  // หัวรายงาน
  const keys: string[][] = [["code", "รหัสจับตัวเลข"], ["site", "ชื่อsiteจับตัวเลข"], ["record", "บันทึกเลขที่"], ["point", "จุดจับตัวเลข"], ["date", "จับตัวเลขวันที่"], ["store", "รหัสร้าน7-elevenที่เปิด"], ["pattern", "รูปแบบการจับตัวเลข"], ["owner", "ผู้รับผิดชอบ"], ["backup", "อันดับความสำคัญของสภาพbackup"]];
  const dates: string[] = [];
  const got = new Set<string>();
  let storeRef = "";
  for (let r = 0; r < hdr; r++) {
    const row = A[r];
    for (let c = 0; c < row.length; c++) {
      const k = norm(row[c]).replace(/:$/, "");
      keys.forEach((kk) => {
        if (k !== kk[1]) return;
        let val = "";
        for (let c2 = c + 1; c2 < row.length; c2++) if (S(row[c2]) && norm(row[c2]) !== ":") { val = S(row[c2]); break; }
        if (kk[0] === "date") { dates.push(val); return; }
        if (got.has(kk[0])) return;
        got.add(kk[0]);
        if (kk[0] === "store") storeRef = ref(r, c);
        const f = R.facts;
        if (kk[0] === "code") f.code = val; else if (kk[0] === "site") f.site = val; else if (kk[0] === "record") f.record = val; else if (kk[0] === "point") f.point = val;
        else if (kk[0] === "store") f.store = val; else if (kk[0] === "pattern") f.pattern = val; else if (kk[0] === "owner") f.owner = val; else if (kk[0] === "backup") f.backup = val;
      });
    }
  }
  R.facts.dates = dates;
  const site = R.facts.site;
  const ym = dates.join(" ").match(/25\d\d/);
  const year = ym ? ym[0] : "";

  // บล็อก
  const H = A[hdr];
  const blocks: Block[] = [];
  for (let c = 0; c < H.length; c++) if (norm(H[c]) === "ผลัดเช้า") {
    const b: Block = { m: c, a: -1, n: -1, t: -1, p: -1, name: "" };
    for (let j = c + 1; j < Math.min(H.length, c + 8); j++) {
      const h = norm(H[j]);
      if (h === "ผลัดเช้า") break;
      if (h === "ผลัดบ่าย" && b.a < 0) b.a = j; else if (h === "ผลัดดึก" && b.n < 0) b.n = j;
      else if (h.indexOf("รวม") === 0 && b.t < 0) b.t = j; else if (h.indexOf("%") >= 0 && b.p < 0) b.p = j;
    }
    for (let up = hdr - 1; up >= Math.max(0, hdr - 3) && !b.name; up--) for (let j = c; j >= Math.max(0, c - 2) && !b.name; j--) if (S(cell(A, up, j))) b.name = S(cell(A, up, j));
    if (b.a < 0 || b.n < 0 || b.t < 0) { R.fatal = "ชีต data: หัวตารางที่คอลัมน์ " + colL(c) + " ไม่ครบ"; return R; }
    blocks.push(b);
  }
  let avgB = null as Block | null;
  blocks.forEach((b) => { if (!avgB && /เฉลี่ย/.test(b.name)) avgB = b; });
  const days = blocks.filter((b) => b !== avgB);
  days.forEach((b, i) => { b.name = "วันที่ " + (i + 1); });
  const labelEnd = blocks[0].m;
  const bv = (r: number, b: Block): BV => ({ m: N(cell(A, r, b.m)), a: N(cell(A, r, b.a)), n: N(cell(A, r, b.n)), t: N(cell(A, r, b.t)), p: b.p >= 0 && isNum(cell(A, r, b.p)) ? N(cell(A, r, b.p)) : null });

  // แถว
  const sections = new Map<string, Sec>(); const secOrder: string[] = []; const rows: DRow[] = [];
  let section = "", sub = "";
  for (let r = hdr + 1; r < A.length; r++) {
    const L0 = S(cell(A, r, 0)), L1 = labelEnd > 1 ? S(cell(A, r, 1)) : "";
    let L2 = "";
    for (let c = 2; c < labelEnd; c++) if (S(cell(A, r, c))) L2 += (L2 ? " " : "") + S(cell(A, r, c));
    const has = blocks.some((b) => [b.m, b.a, b.n, b.t].some((c) => isNum(cell(A, r, c))));
    if (/^หมายเหตุ/.test(L0) || /^หมายเหตุ/.test(L1)) { R.remarks.push(L0 || L1); continue; }
    if (!has) { if (L0 && !L1 && !L2) { section = L0; sub = ""; } continue; }
    if (L0) { section = L0; sub = ""; }
    if (!sections.has(section)) { sections.set(section, { name: section, subs: new Map<string, DRow[]>(), subOrder: [], total: null }); secOrder.push(section); }
    const sec = sections.get(section) as Sec;
    const lab = L2 || L1;
    const isTotal = /ยอดรวม/.test(L1 + L2) || /^จำนวน/.test(lab);
    const rec: DRow = { r: r, label: lab, section: section, sub: "", v: blocks.map((b) => bv(r, b)), total: isTotal };
    if (isTotal) sec.total = rec;
    else {
      if (L1 && L2) sub = L1;
      rec.sub = sub || "-";
      if (!sec.subs.has(rec.sub)) { sec.subs.set(rec.sub, []); sec.subOrder.push(rec.sub); }
      (sec.subs.get(rec.sub) as DRow[]).push(rec);
    }
    rows.push(rec);
  }
  let personSec = null as Sec | null, allSec = null as Sec | null;
  const carSecs: Sec[] = [];
  secOrder.forEach((n) => {
    const s = sections.get(n) as Sec;
    if (!s.total) return;
    if (/คน/.test(s.total.label)) { if (!personSec) personSec = s; }
    else if (/รถ/.test(s.total.label)) { if (/ทั้งหมด/.test(n)) allSec = s; else carSecs.push(s); }
  });
  if (!personSec) { R.fatal = "ชีต data: ไม่พบแถว \"จำนวนคน (ยอดรวม)\""; return R; }
  const PS: Sec = personSec;
  const PSt = PS.total as DRow;
  const AS: Sec | null = allSec;
  const leaves = (s: Sec): DRow[] => { const out: DRow[] = []; s.subOrder.forEach((k) => (s.subs.get(k) as DRow[]).forEach((x) => out.push(x))); return out; };

  // 1) shift
  rows.forEach((x) => blocks.forEach((b, bi) => {
    const v = x.v[bi], s = v.m + v.a + v.n;
    if (!check(R, "shift", close(s, v.t))) issue(R, "shift", "bad", dName, ref(x.r, b.t), "'" + x.label + "' " + b.name + ": เช้า+บ่าย+ดึก ไม่เท่ากับรวมทั้งวัน", "เช้า " + fmt(v.m) + " + บ่าย " + fmt(v.a) + " + ดึก " + fmt(v.n) + " = " + fmt(s) + " แต่ช่องรวมทั้งวันเป็น " + fmt(v.t));
  }));
  // 2) group
  const allSections: Sec[] = [PS].concat(carSecs).concat(AS ? [AS] : []);
  allSections.forEach((s) => {
    const tot = s.total as DRow;
    s.subOrder.forEach((sb) => {
      const list = s.subs.get(sb) as DRow[];
      blocks.forEach((b, bi) => {
        F.forEach((f, fi) => {
          const sum = list.reduce((a, x) => a + fv(x.v[bi], f), 0), tv = fv(tot.v[bi], f);
          const col = fi === 0 ? b.m : fi === 1 ? b.a : fi === 2 ? b.n : b.t;
          if (!check(R, "group", close(sum, tv))) issue(R, "group", "bad", dName, ref(tot.r, col), (s === PS ? "หมวด" + sb : s.name) + " " + SH[fi] + " " + b.name + ": รวมไม่เท่ากับยอดรวม", "รวมทุกแถวได้ " + fmt(sum) + " แต่ยอดรวมเป็น " + fmt(tv));
        });
        list.forEach((x) => {
          const v = x.v[bi], tt = tot.v[bi].t;
          if (v.p !== null && tt) if (!check(R, "group", close(v.p, v.t / tt, 0.0005))) issue(R, "group", "bad", dName, ref(x.r, b.p), "'" + x.label + "' " + b.name + ": % สัดส่วนไม่ถูก", "ในไฟล์เป็น " + pc(v.p) + " แต่ " + fmt(v.t) + " ÷ " + fmt(tt) + " = " + pc(v.t / tt));
        });
      });
    });
  });
  // 3) allcars
  if (AS && carSecs.length) {
    const ASt = AS.total as DRow;
    blocks.forEach((b, bi) => {
      leaves(AS).forEach((x) => F.forEach((f, fi) => {
        let sum = 0; const parts: string[] = [];
        carSecs.forEach((s) => leaves(s).forEach((y) => { if (norm(y.label) === norm(x.label)) { sum += fv(y.v[bi], f); parts.push(fmt(fv(y.v[bi], f))); } }));
        const col = fi === 0 ? b.m : fi === 1 ? b.a : fi === 2 ? b.n : b.t;
        if (!check(R, "allcars", close(sum, fv(x.v[bi], f)))) issue(R, "allcars", "bad", dName, ref(x.r, col), "รถทั้งหมด '" + x.label + "' " + SH[fi] + " " + b.name + ": ไม่เท่ากับผลรวมกลุ่มรถ", parts.join(" + ") + " = " + fmt(sum) + " แต่ช่องรถทั้งหมดเป็น " + fmt(fv(x.v[bi], f)));
      }));
      F.forEach((f, fi) => {
        const sum = carSecs.reduce((a, s) => a + fv((s.total as DRow).v[bi], f), 0);
        const col = fi === 0 ? b.m : fi === 1 ? b.a : fi === 2 ? b.n : b.t;
        if (!check(R, "allcars", close(sum, fv(ASt.v[bi], f)))) issue(R, "allcars", "bad", dName, ref(ASt.r, col), "ยอดรถทั้งหมด " + SH[fi] + " " + b.name + ": ไม่เท่ากับผลรวมทุกกลุ่ม", "ผลรวม " + fmt(sum) + " แต่ยอดรวมเป็น " + fmt(fv(ASt.v[bi], f)));
      });
      carSecs.forEach((s) => {
        const v = (s.total as DRow).v[bi], all = ASt.v[bi].t;
        if (v.p !== null && all) if (!check(R, "allcars", close(v.p, v.t / all, 0.0005))) issue(R, "allcars", "bad", dName, ref((s.total as DRow).r, b.p), s.name + " " + b.name + ": % ของรถทั้งหมดไม่ถูก", "ในไฟล์เป็น " + pc(v.p) + " แต่คำนวณได้ " + pc(v.t / all));
      });
    });
  }
  // 4) avg
  const AB: Block | null = avgB;
  if (AB && days.length >= 2) {
    const ai = blocks.indexOf(AB);
    rows.forEach((x) => F.forEach((f, fi) => {
      const ds = days.map((d) => fv(x.v[blocks.indexOf(d)], f));
      const mean = ds.reduce((a, y) => a + y, 0) / ds.length;
      const col = fi === 0 ? AB.m : fi === 1 ? AB.a : fi === 2 ? AB.n : AB.t;
      if (!check(R, "avg", close(mean, fv(x.v[ai], f)))) issue(R, "avg", "bad", dName, ref(x.r, col), "'" + x.label + "' " + SH[fi] + ": ค่าเฉลี่ยไม่ถูก", "(" + ds.map(fmt).join(" + ") + ") ÷ " + ds.length + " = " + fmt(mean) + " แต่ในไฟล์เป็น " + fmt(fv(x.v[ai], f)));
    }));
  } else R.notes.push("ไม่พบคอลัมน์ \"เฉลี่ย\" หรือมีข้อมูลไม่ถึง 2 วัน จึงข้ามการตรวจค่าเฉลี่ย");
  // 5,6)
  if (days.length === 2) {
    const i1 = blocks.indexOf(days[0]), i2 = blocks.indexOf(days[1]);
    rows.forEach((x) => {
      for (let fi = 0; fi < 3; fi++) {
        const f = F[fi], a = fv(x.v[i1], f), b = fv(x.v[i2], f), hi = Math.max(a, b), lo = Math.min(a, b);
        if (!check(R, "twoday", !(hi >= 30 && (lo === 0 || hi / lo >= 3)))) {
          let det = "วันที่ 1 = " + fmt(a) + ", วันที่ 2 = " + fmt(b) + " ต่างกัน " + (lo === 0 ? "มาก (อีกวันเป็น 0)" : (hi / lo).toFixed(1) + " เท่า") + " แต่ค่าเฉลี่ยยังรวมตัวเลขนี้อยู่";
          if (R.remarks.length) det += " — หมายเหตุในไฟล์: \"" + R.remarks.join(" / ") + "\"";
          const col = fi === 0 ? days[0].m : fi === 1 ? days[0].a : days[0].n;
          issue(R, "twoday", "warn", dName, ref(x.r, col), "'" + x.label + "' " + (x.section !== PS.name ? "(" + x.section + ") " : "") + SH[fi] + ": สองวันต่างกันมาก", det);
        }
      }
      if (!x.total && x.v[i1].t >= 100) {
        const same = x.v[i1].t === x.v[i2].t && (x.v[i1].m !== x.v[i2].m || x.v[i1].a !== x.v[i2].a);
        if (!check(R, "sameday", !same)) issue(R, "sameday", "warn", dName, ref(x.r, days[0].t), "'" + x.label + "' ได้ " + fmt(x.v[i1].t) + " เท่ากันทั้งสองวัน", "ตัวเลขรายผลัดต่างกัน น่าจะบังเอิญ แต่ควรดูว่าไม่ได้คัดลอกยอดมาผิดวัน");
      }
    });
  }
  // หัวรายงาน
  if (!check(R, "header", !!site)) issue(R, "header", "warn", dName, "", "ไม่พบชื่อ SITE จับตัวเลข", "การตรวจชื่อทำเลในชีตอื่นจะข้ามไป");
  if (got.has("store")) { const st = R.facts.store.replace(/\s/g, ""); if (!check(R, "header", !(st === "" || /^\(\)/.test(st)))) issue(R, "header", "warn", dName, storeRef, "รหัสร้าน 7-Eleven ยังว่าง", "ช่องรหัสร้านที่เปิดเขียนว่า \"" + R.facts.store + "\""); }

  // ---------- ตารางเทียบ
  const AV = AB ? blocks.indexOf(AB) : (days.length ? blocks.indexOf(days[0]) : 0);
  const lookup = new Map<string, BV>();
  const P = new Map<string, DRow>();
  const put = (k: string, v: BV) => { if (!lookup.has(norm(k))) lookup.set(norm(k), v); };
  leaves(PS).forEach((x) => { put(x.label, x.v[AV]); P.set(norm(x.label), x); });
  const PT = PSt.v[AV];
  ["จำนวนคน (ยอดรวม)", "เพศ", "ทิศคน"].forEach((k) => put(k, PT));
  const secKey = (n: string) => norm(n.replace(/\(.*?\)/g, ""));
  carSecs.forEach((s) => lookup.set(secKey(s.name), (s.total as DRow).v[AV]));
  const CT: BV | null = AS ? (AS.total as DRow).v[AV] : (carSecs[0] ? (carSecs[0].total as DRow).v[AV] : null);
  const carLeaf = (re: RegExp): BV | null => { const src = AS || carSecs[0]; if (!src) return null; let f = null as BV | null; leaves(src).forEach((x) => { if (!f && re.test(norm(x.label))) f = x.v[AV]; }); return f; };
  if (AS) leaves(AS).forEach((x) => lookup.set(norm(x.label), x.v[AV]));
  if (CT) put("จำนวนรถ (ยอดรวม)", CT);
  const alias = new Map<string, string>([["ชาย", "ผู้ชาย"], ["หญิง", "ผู้หญิง"], ["รถอื่นๆ", "รถ4ล้อทุกชนิด"], ["ขาจร", "อื่นๆ(ขาจร)"], ["คนขาจร", "อื่นๆ(ขาจร)"]]);
  const find = (lab: string): BV | null => { const k = norm(lab); const d = lookup.get(k); if (d) return d; const al = alias.get(k); if (al) { const d2 = lookup.get(al); if (d2) return d2; } return null; };
  const Pget = (k: string): DRow | null => { const x = P.get(norm(k)); return x ? x : null; };

  // ---------- ชีตสรุป
  const texts: TextItem[] = [];
  book.names.filter((n) => /^สรุป/.test(n.trim())).forEach((sn) => {
    const B = grid(sn);
    B.forEach((row, r) => {
      row.forEach((v, c) => { if (typeof v === "string" && S(v).length > 6 && !isNum(v)) texts.push({ sheet: sn, ref: ref(r, c), text: S(v), map: false, cell: true, shape: false }); });
      let f0 = -1;
      for (let c = 0; c < row.length; c++) if (typeof row[c] === "number") { f0 = c; break; }
      if (f0 < 0) return;
      let lab = "";
      for (let c = f0 - 1; c >= 0; c--) if (S(row[c]) && !isNum(row[c])) { lab = S(row[c]); break; }
      if (!lab) return;
      const vs = [0, 1, 2, 3].map((i) => (row[f0 + i] === undefined ? "" : row[f0 + i]));
      if (!vs.every((x) => isNum(x) || x === "") || vs.filter((x) => isNum(x)).length < 3) return;
      const ref0 = find(lab);
      if (!ref0) return;
      vs.forEach((x, i) => {
        if (!check(R, "summary", close(N(x), fv(ref0, F[i])))) issue(R, "summary", "bad", sn, ref(r, f0 + i), "'" + lab + "' " + SH[i] + " ไม่ตรงกับ data", "ในชีต " + sn + " เป็น " + fmt(N(x)) + " แต่ค่าเฉลี่ยใน data เป็น " + fmt(fv(ref0, F[i])));
      });
      const pv = row[f0 + 4];
      if (typeof pv === "number") {
        const ep = ref0 === PT || ref0 === CT ? 1 : ref0.p;
        if (ep !== null) if (!check(R, "summary", Math.abs(pv - ep) <= 0.0005)) issue(R, "summary", "bad", sn, ref(r, f0 + 4), "'" + lab + "' %สัดส่วนไม่ตรง", "ในชีต " + sn + " เป็น " + pc(pv) + " แต่ควรเป็น " + pc(ep));
      }
    });
  });

  // ---------- แผนที่และกล่องข้อความ
  const mapName = sheetBy((n) => /^แผนที่/.test(n.trim()));
  if (mapName) grid(mapName).forEach((row, r) => row.forEach((v, c) => { if (typeof v === "string" && S(v)) texts.push({ sheet: mapName, ref: ref(r, c), text: S(v), map: true, cell: true, shape: false }); }));
  let shapeCount = 0;
  book.names.forEach((sn) => {
    if (sn === dName) return;
    (book.texts.get(sn) || []).forEach((t) => {
      shapeCount++;
      const one = S(t).replace(/\s+/g, " ");
      texts.push({ sheet: sn, ref: "กล่องข้อความ \"" + (one.length > 28 ? one.slice(0, 28) + "…" : one) + "\"", text: S(t), map: sn === mapName, cell: false, shape: true });
    });
  });
  R.facts.shapeCount = shapeCount;
  if (mapName && !(book.texts.get(mapName) || []).length) R.notes.push("ชีต " + mapName + ": ไม่พบกล่องข้อความ จึงตรวจได้เฉพาะข้อความในเซลล์");

  const pctLabels: { label: string; p: number }[] = [];
  leaves(PS).forEach((x) => pctLabels.push({ label: x.label, p: x.v[AV].t / PT.t }));
  const pm = Pget("ผู้ชาย"), pf = Pget("ผู้หญิง"), po = Pget("อื่นๆ(ขาจร)");
  if (pm) pctLabels.push({ label: "ชาย", p: pm.v[AV].t / PT.t });
  if (pf) pctLabels.push({ label: "หญิง", p: pf.v[AV].t / PT.t });
  if (po) pctLabels.push({ label: "ขาจร", p: po.v[AV].t / PT.t });
  if (CT) {
    const ct = CT;
    if (AS) leaves(AS).forEach((x) => pctLabels.push({ label: x.label, p: x.v[AV].t / ct.t }));
    carSecs.forEach((s) => pctLabels.push({ label: s.name, p: (s.total as DRow).v[AV].t / ct.t }));
  }
  const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const dayNums: string[] = []; dates.forEach((d) => { const mm = d.match(/ที่\s*(\d{1,2})/); if (mm) dayNums.push(mm[1]); });
  let mon = ""; months.forEach((m) => { if (!mon && dates.join(" ").indexOf(m) >= 0) mon = m; });
  const dateMissing = (t: string): string[] => { const miss = dayNums.filter((d) => !new RegExp("(^|\\D)" + d + "(\\D|$)").test(t)); if (mon && t.indexOf(mon) < 0) miss.push(mon); if (year && t.indexOf(year) < 0) miss.push(year); return miss; };
  const secByVerb = (verb: string, loc: string): Sec | null => {
    const cand = carSecs.filter((s) => norm(s.name).indexOf("รถ" + verb) === 0);
    if (loc) { const k = norm("รถ" + verb + loc); const hit = cand.filter((s) => secKey(s.name) === k); if (hit.length) return hit[0]; }
    return cand.length === 1 ? cand[0] : null;
  };
  // กลุ่มสำหรับ "ส่วนใหญ่"
  interface RItem { key: string; label: string; t: number; p: number; g: string; }
  const groups = new Map<string, RItem[]>(); const variant = new Map<string, RItem>();
  const addGroup = (gname: string, items: { label: string; t: number }[], base: number) => {
    const its: RItem[] = items.map((x) => ({ key: norm(x.label), label: x.label.trim(), t: x.t, p: x.t / base, g: gname }));
    its.sort((a, b) => b.t - a.t);
    groups.set(gname, its); its.forEach((it) => variant.set(it.key, it));
  };
  PS.subOrder.forEach((sb) => addGroup(sb, (PS.subs.get(sb) as DRow[]).map((x) => ({ label: x.label, t: x.v[AV].t })), PT.t));
  if (AS && CT) { const ct = CT; AS.subOrder.forEach((sb) => addGroup("ประเภทรถ", (AS.subs.get(sb) as DRow[]).map((x) => ({ label: x.label, t: x.v[AV].t })), ct.t)); }
  if (carSecs.length > 1 && CT) { const ct = CT; addGroup("กลุ่มรถ", carSecs.map((x) => ({ label: x.name, t: (x.total as DRow).v[AV].t })), ct.t); }
  [["ชาย", "ผู้ชาย"], ["หญิง", "ผู้หญิง"], ["ขาจร", "อื่นๆ(ขาจร)"], ["คนขาจร", "อื่นๆ(ขาจร)"]].forEach((a) => { const v = variant.get(norm(a[1])); if (v) variant.set(norm(a[0]), v); });
  const variantList = Array.from(variant.keys()).sort((a, b) => b.length - a.length);
  const numOf = (x: string) => parseInt(x.replace(/,/g, ""), 10);

  texts.forEach((T) => {
    const RL = T.map ? "map" : "text";
    // ส่วนใหญ่
    const nt0 = norm(T.text.replace(/\(นับ.*?\)/g, ""));
    const used = new Set<number>(); const byG = new Map<string, RItem[]>();
    variantList.forEach((vk) => {
      const key2 = vk.replace(/\(นับ.*?\)/g, ""); const re2 = new RegExp(esc(key2) + "([\\d.]+)%", "g");
      let mm2: RegExpExecArray | null;
      while ((mm2 = re2.exec(nt0)) !== null) {
        const end = mm2.index + mm2[0].length; if (used.has(end)) continue; used.add(end);
        const it = variant.get(vk) as RItem; const arr = byG.get(it.g) || []; if (arr.indexOf(it) < 0) arr.push(it); byG.set(it.g, arr);
      }
    });
    byG.forEach((its, gn) => {
      const g = groups.get(gn) as RItem[]; if (its.length === g.length) return;
      const minM = Math.min(...its.map((x) => x.t));
      const above = g.filter((x) => its.indexOf(x) < 0 && x.t > minM);
      if (!check(R, "ranking", !above.length)) issue(R, "ranking", "warn", T.sheet, T.ref, "ข้อความยกหมวด" + gn + "ที่ไม่ใช่อันดับต้น", "ข้อความพูดถึง " + its.map((x) => x.label + " " + pc(x.p)).join(", ") + " แต่ " + above.map((x) => x.label + " " + pc(x.p)).join(", ") + " มากกว่า");
    });
    // ยอดคน/รถ
    let m = T.text.match(/คน(?:เดิน)?ผ่าน\s*([\d,]+)/) || (T.shape ? T.text.match(/^\s*([\d,]{3,})\s*คน\s*$/) : null);
    if (m) { const want = Math.round(PT.t); if (!check(R, RL, numOf(m[1]) === want)) issue(R, RL, "bad", T.sheet, T.ref, "ข้อความ \"" + S(m[0]) + "\" ไม่ตรงกับยอดคน", "ยอดคนเฉลี่ยใน data คือ " + fmt(PT.t) + " (ปัดเป็น " + fmt(want) + ")"); }
    m = T.text.match(/รถ(?:วิ่ง)?ผ่าน\s*([\d,]+)/) || (T.shape ? T.text.match(/^\s*([\d,]{3,})\s*คัน\s*$/) : null);
    if (m && CT) { const w2 = Math.round(CT.t); if (!check(R, RL, numOf(m[1]) === w2)) issue(R, RL, "bad", T.sheet, T.ref, "ข้อความ \"" + S(m[0]) + "\" ไม่ตรงกับยอดรถ", "ยอดรถเฉลี่ยใน data คือ " + fmt(CT.t) + " (ปัดเป็น " + fmt(w2) + ")"); }
    const nt = norm(T.text.replace(/\(.*?\)/g, ""));
    carSecs.forEach((sx) => {
      const mm = nt.match(new RegExp(esc(secKey(sx.name)) + "([\\d,]+)คัน"));
      if (!mm) return;
      const w3 = Math.round((sx.total as DRow).v[AV].t);
      if (!check(R, RL, numOf(mm[1]) === w3)) issue(R, RL, "bad", T.sheet, T.ref, sx.name.trim() + " เขียนว่า " + mm[1] + " คัน แต่ data ได้ " + fmt(w3), "ค่าเฉลี่ยใน data คือ " + fmt((sx.total as DRow).v[AV].t) + " คัน");
    });
    const lines = T.text.split(/\n/).map((x) => S(x)).filter((x) => !!x);
    const loc = lines.length > 1 && !/\d/.test(lines[0]) ? lines[0] : "";
    lines.forEach((ln) => {
      const mm = ln.match(/^รถ(เข้า|ออก)\s*([\d,]+)\s*คัน/);
      if (!mm) return;
      const sx = secByVerb(mm[1], loc);
      if (!sx) { if (!check(R, RL, false)) issue(R, RL, "warn", T.sheet, T.ref, "ไม่รู้ว่า \"" + ln + "\" หมายถึงกลุ่มรถไหน", "ใน data มีกลุ่มรถ: " + carSecs.map((s) => s.name.trim()).join(", ")); return; }
      const w4 = Math.round((sx.total as DRow).v[AV].t);
      if (!check(R, RL, numOf(mm[2]) === w4)) issue(R, RL, "bad", T.sheet, T.ref, (loc ? loc + " " : "") + "รถ" + mm[1] + " เขียนว่า " + mm[2] + " คัน แต่ data ได้ " + fmt(w4), "ค่าเฉลี่ย " + sx.name.trim() + " ใน data คือ " + fmt((sx.total as DRow).v[AV].t) + " คัน");
    });
    const bm = T.text.match(/back\s*up\s*:?\s*(.+)/i);
    if (bm && R.facts.backup) { if (!check(R, RL, norm(bm[1]) === norm(R.facts.backup))) issue(R, RL, "bad", T.sheet, T.ref, "สภาพ Back Up ไม่ตรงกับชีต data", "ที่นี่เขียนว่า \"" + S(bm[1]) + "\" แต่ data เขียนว่า \"" + R.facts.backup + "\""); }
    if (T.cell && /จับตัวเลข/.test(T.text) && !/ว{3,}|ด{3,}/.test(T.text) && dayNums.length && (T.map || /จับตัวเลขวัน/.test(T.text))) {
      const rr = T.map ? "map" : "naming"; const miss = dateMissing(T.text);
      if (!check(R, rr, !miss.length)) issue(R, rr, "bad", T.sheet, T.ref, "วันที่ไม่ตรงกับวันที่จับตัวเลข", "\"" + T.text + "\" แต่ data คือ " + dates.join(" และ "));
    }
    if (T.map && T.cell && /^แผนที่/.test(T.text) && site) { if (!check(R, "map", norm(T.text).indexOf(norm(site)) >= 0)) issue(R, "map", "bad", T.sheet, T.ref, "หัวแผนที่ไม่ใช่ทำเลรอบนี้", "\"" + T.text + "\" แต่ทำเลคือ " + site); }
    // %
    const seen = new Set<number>();
    pctLabels.forEach((pl) => {
      const re = new RegExp(esc(pl.label.trim()) + "\\s*([\\d.]+)\\s*%", "g");
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(T.text)) !== null) {
        const end = mm.index + mm[0].length; if (seen.has(end)) continue; seen.add(end);
        if (!check(R, RL, Math.abs(parseFloat(mm[1]) - pl.p * 100) <= 0.015)) issue(R, RL, "bad", T.sheet, T.ref, "ข้อความ \"" + pl.label.trim() + " " + mm[1] + "%\" ไม่ตรง", "คำนวณจาก data ได้ " + (pl.p * 100).toFixed(2) + "%");
      }
    });
    if (/ไม่แตกต่าง/.test(T.text)) {
      [["ซ้าย", "ขวา", "ซ้าย", "ขวา"], ["ชาย", "หญิง", "ผู้ชาย", "ผู้หญิง"]].forEach((pr) => {
        if (T.text.indexOf(pr[0] + "-" + pr[1]) < 0) return;
        const a = Pget(pr[2]), b = Pget(pr[3]); if (!a || !b) return;
        const pa = a.v[AV].t / PT.t, pb = b.v[AV].t / PT.t, d = Math.abs(pa - pb) * 100;
        if (!check(R, "wording", d < 10)) issue(R, "wording", "warn", T.sheet, T.ref, "เขียนว่า \"" + pr[0] + "-" + pr[1] + " ไม่แตกต่างกัน\" แต่ต่างกัน " + d.toFixed(1) + " จุด", pr[0] + " " + pc1(pa) + " · " + pr[1] + " " + pc1(pb));
      });
    }
  });

  // ---------- ชีตกราฟ
  const gName = sheetBy((n) => norm(n) === "กราฟ");
  const hours: { label: string; people: number; cars: number }[] = [];
  let gG: CV[][] = [], gTc = -1, gHourRows: number[] = [];
  let gColName = (c: number): string => colL(c);
  if (gName) {
    const G = grid(gName); gG = G;
    let hr = -1, tc = -1;
    for (let r = 0; r < G.length && hr < 0; r++) for (let c = 0; c < G[r].length; c++) if (norm(G[r][c]) === "ช่วงเวลา") { hr = r; tc = c; break; }
    if (hr >= 0) {
      gTc = tc;
      let maxC = 0; G.forEach((rw) => { if (rw.length > maxC) maxC = rw.length; });
      const lab2: string[] = []; for (let c = 0; c < maxC; c++) lab2[c] = norm(cell(G, hr + 1, c)) || norm(cell(G, hr, c));
      const groupsH: { name: string; hrs: number[]; r: number }[] = []; let cur: number[] = []; const shiftRows: number[] = []; let totRow = -1;
      for (let r = hr + 1; r < G.length; r++) {
        const t = S(cell(G, r, tc));
        if (/^\d{1,2}[:.]\d{2}/.test(t)) cur.push(r);
        else if (/^ผลัด/.test(t)) { groupsH.push({ name: t, hrs: cur, r: r }); shiftRows.push(r); cur = []; }
        else if (t === "รวม") { totRow = r; break; }
      }
      groupsH.forEach((g) => { gHourRows = gHourRows.concat(g.hrs); });
      const numCols: number[] = []; for (let c = tc + 1; c < maxC; c++) if (groupsH.some((g) => isNum(cell(G, g.r, c)))) numCols.push(c);
      const colName = (c: number): string => S(cell(G, hr + 1, c)).replace(/\s+/g, "") || S(cell(G, hr, c)) || colL(c);
      gColName = colName;
      groupsH.forEach((g) => numCols.forEach((c) => {
        const s = g.hrs.reduce((a, rr) => a + N(cell(G, rr, c)), 0), want = N(cell(G, g.r, c));
        if (!check(R, "hourly", close(s, want))) issue(R, "hourly", "bad", gName, ref(g.r, c), g.name + " คอลัมน์ '" + colName(c) + "': รวมรายชั่วโมงไม่เท่ากับยอดผลัด", "รวมได้ " + fmt(s) + " แต่ช่องผลัดเป็น " + fmt(want));
      }));
      const pc0 = tc + 1; const carCol = lab2.indexOf("จำนวนรถ");
      if (totRow >= 0) {
        numCols.forEach((c) => {
          const s = shiftRows.reduce((a, rr) => a + N(cell(G, rr, c)), 0), want = N(cell(G, totRow, c));
          if (!check(R, "hourly", close(s, want))) issue(R, "hourly", "bad", gName, ref(totRow, c), "แถวรวม คอลัมน์ '" + colName(c) + "': ไม่เท่ากับผลรวมทุกผลัด", "รวมได้ " + fmt(s) + " แต่แถวรวมเป็น " + fmt(want));
        });
        const tv = (c: number) => N(cell(G, totRow, c));
        if (!check(R, "hourcols", close(tv(pc0), PT.t))) issue(R, "hourcols", "bad", gName, ref(totRow, pc0), "จำนวนคนรวมในตารางรายชั่วโมงไม่ตรงกับ data", fmt(tv(pc0)) + " เทียบกับ " + fmt(PT.t));
        if (carCol >= 0 && CT) if (!check(R, "hourcols", close(tv(carCol), CT.t))) issue(R, "hourcols", "bad", gName, ref(totRow, carCol), "จำนวนรถรวมในตารางรายชั่วโมงไม่ตรงกับ data", fmt(tv(carCol)) + " เทียบกับ " + fmt(CT.t));
        const personEnd = carCol >= 0 ? carCol : maxC;
        const colSub = new Map<number, string>(); const matched = new Set<string>();
        for (let c = pc0 + 1; c < personEnd; c++) {
          const k2 = lab2[c]; if (!k2) continue;
          const key = alias.get(k2) || (k2 === "อื่นๆ" && P.has(norm("อื่นๆ(ขาจร)")) ? norm("อื่นๆ(ขาจร)") : k2);
          const x = P.get(key);
          if (x) {
            colSub.set(c, x.sub); matched.add(key);
            if (!check(R, "hourcols", close(tv(c), x.v[AV].t))) issue(R, "hourcols", "bad", gName, ref(totRow, c), "คอลัมน์ '" + colName(c) + "' รวมไม่ตรงกับ data", fmt(tv(c)) + " เทียบกับ " + fmt(x.v[AV].t));
          }
        }
        PS.subOrder.forEach((sb) => {
          const cs: number[] = []; colSub.forEach((v, k) => { if (v === sb) cs.push(k); });
          if (!cs.length) return;
          const lo = Math.min(...cs); let hi = Math.max(...cs);
          while (hi + 1 < personEnd && !colSub.has(hi + 1) && lab2[hi + 1]) hi++;
          let sum = 0; const extra: string[] = [];
          const missing = (PS.subs.get(sb) as DRow[]).filter((x) => !matched.has(norm(x.label)));
          for (let c = lo; c <= hi; c++) {
            sum += tv(c);
            if (colSub.has(c)) continue;
            const same = missing.filter((x) => close(x.v[AV].t, tv(c)))[0];
            if (same) { missing.splice(missing.indexOf(same), 1); extra.push("'" + colName(c) + "' (" + fmt(tv(c)) + ") น่าจะคือ " + same.label); }
            else extra.push("'" + colName(c) + "' = " + fmt(tv(c)));
          }
          const ok = close(sum, PT.t) && !missing.length;
          if (!check(R, "hourcols", ok)) {
            const hint = extra.length ? " คอลัมน์ที่ชื่อไม่ตรงกับ data: " + extra.join(", ") : "";
            issue(R, "hourcols", close(sum, PT.t) ? "warn" : "bad", gName, ref(totRow, lo) + ":" + ref(totRow, hi), "ตารางรายชั่วโมงหมวด" + sb + (close(sum, PT.t) ? " ชื่อคอลัมน์ไม่ตรงกับ data" : " รวมได้ไม่ครบ"), "รวมทุกคอลัมน์ได้ " + fmt(sum) + " จากยอดคน " + fmt(PT.t) + "." + hint, missing.length ? { head: ["หมวดใน data ที่ไม่มีคอลัมน์", "คน/วัน (เฉลี่ย)"], rows: missing.map((x) => [x.label, fmt(x.v[AV].t)]) } : null);
          }
        });
        let lc = -1; for (let c = personEnd; c < maxC; c++) if (lab2[c] === "ซ้าย") { lc = c; break; }
        let carDirMissing = false;
        if (lc >= 0 && lab2[lc + 1] === "ขวา") {
          const l = tv(lc), r2 = tv(lc + 1), t2 = l + r2;
          carDirMissing = t2 > 0 && Math.min(l, r2) < 0.05 * t2;
          if (!check(R, "hourcols", !carDirMissing)) issue(R, "hourcols", "warn", gName, ref(totRow, lc), "ทิศรถในตารางรายชั่วโมงน่าจะไม่ได้กรอกจริง", "ซ้าย " + fmt(l) + " คัน · ขวา " + fmt(r2) + " คัน");
        }
        groupsH.forEach((g) => g.hrs.forEach((rr) => hours.push({ label: S(cell(G, rr, tc)), people: N(cell(G, rr, pc0)), cars: carCol >= 0 ? N(cell(G, rr, carCol)) : 0 })));
        // ตาราง % ด้านบน
        let mode = "p"; const topBad: string[][] = [];
        for (let r = 0; r < hr; r++) {
          const rw = G[r]; let li = -1;
          for (let c = 0; c < rw.length; c++) if (S(rw[c]) && !isNum(rw[c])) { li = c; break; }
          if (li < 0) continue;
          const L = norm(rw[li]);
          if (L === "ประเภทรถ" || L === "ทิศรถ") mode = L;
          let vi = -1; for (let c = li + 1; c < Math.min(rw.length, li + 4); c++) if (typeof rw[c] === "number") { vi = c; break; }
          if (vi < 0) continue;
          const v = rw[vi] as number, rf = ref(r, vi), lb = S(rw[li]);
          if (L === "จำนวนคน(ยอดรวม)") { if (!check(R, "toptable", Math.round(v) === Math.round(PT.t))) topBad.push([rf, lb, fmt(v), fmt(PT.t)]); continue; }
          if (L === "จำนวนรถ(ยอดรวม)") { if (CT && !check(R, "toptable", Math.round(v) === Math.round(CT.t))) topBad.push([rf, lb, fmt(v), fmt(CT.t)]); continue; }
          if (v > 1.5) continue;
          if (mode === "p") {
            const x2 = P.get(alias.get(L) || L);
            if (x2 && !check(R, "toptable", Math.abs(v - x2.v[AV].t / PT.t) <= 0.0006)) topBad.push([rf, lb, pc(v), pc(x2.v[AV].t / PT.t)]);
          } else if (mode === "ประเภทรถ") {
            const w = /จักรยานยนต์|จยย/.test(L) ? carLeaf(/จยย/) : /ส่วนบุคคล|4ล้อ/.test(L) ? carLeaf(/4ล้อ/) : null;
            if (w && CT) { const p3 = w.t / CT.t; if (!check(R, "toptable", Math.abs(v - p3) <= 0.0006)) topBad.push([rf, lb, pc(v), pc(p3)]); }
            else if (!w) { if (!check(R, "toptable", v < 0.0005)) topBad.push([rf, lb, pc(v), "ไม่มีหมวดนี้"]); }
          } else if (mode === "ทิศรถ") {
            if (!check(R, "toptable", !(carDirMissing && v > 0.0005))) topBad.push([rf, "ทิศรถ " + lb, pc(v), "ไม่ได้นับแยกทิศ"]);
          }
        }
        if (topBad.length) issue(R, "toptable", "bad", gName, topBad[0][0] + (topBad.length > 1 ? " ถึง " + topBad[topBad.length - 1][0] : ""), "ตาราง % ด้านบนชีตกราฟไม่ตรงกับ data " + topBad.length + " ช่อง", "ตัวเลขเหล่านี้น่าจะค้างจากไฟล์เก่า ควรลิงก์ช่องไปที่ชีต data แทนการพิมพ์ตัวเลข", { head: ["ช่อง", "หัวข้อ", "ในชีตกราฟ", "data"], rows: topBad });
      }
    } else R.notes.push("ชีตกราฟ: ไม่พบหัวตาราง \"ช่วงเวลา\" จึงข้ามการตรวจรายชั่วโมง");
  }
  // ช่วงเวลาที่เขียนว่าเยอะ
  const toMin = (s: string) => { const p = s.split(/[:.]/); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); };
  if (hours.length) texts.forEach((T) => {
    [["คนผ่านเยอะ", "people", "คน"], ["รถผ่านเยอะ", "cars", "รถ"]].forEach((k) => {
      if (T.text.indexOf(k[0]) < 0) return;
      const rg: number[][] = []; const re = /(\d{1,2}[:.]\d{2})\s*-\s*(\d{1,2}[:.]\d{2})/g; let m: RegExpExecArray | null;
      while ((m = re.exec(T.text)) !== null) { const a = toMin(m[1]); let b = toMin(m[2]); if (b <= a) b += 1440; rg.push([a, b]); }
      if (!rg.length) return;
      const val = (h: { people: number; cars: number }) => (k[1] === "people" ? h.people : h.cars);
      const top = hours.slice().sort((x, y) => val(y) - val(x)).slice(0, 3);
      const out = top.filter((h) => { const s = toMin(h.label.slice(0, 5)), e = s + 60; return !rg.some((q) => (s >= q[0] && e <= q[1]) || (s + 1440 >= q[0] && e + 1440 <= q[1])); });
      if (!check(R, "peak", !out.length)) issue(R, "peak", "warn", T.sheet, T.ref, "ช่วงเวลาที่เขียนว่า" + k[2] + "เยอะ ไม่ครอบคลุมชั่วโมงที่สูงสุด", "3 ชั่วโมงที่สูงสุด: " + top.map((h) => h.label + " (" + fmt(val(h)) + ")").join(", ") + " แต่ " + out.map((h) => h.label).join(", ") + " ไม่อยู่ในช่วงที่เขียนไว้");
    });
  });
  // ---------- chart
  book.names.forEach((sn) => {
    (book.charts.get(sn) || []).forEach((ch, ci) => {
      ch.series.forEach((se, si) => {
        const tag = sn + " · กราฟรูปที่ " + (ci + 1) + (ch.series.length > 1 ? " ชุดที่ " + (si + 1) : "");
        const va = se.val || [];
        if (!va.length) { R.facts.charts.push({ tag: tag, range: "(อ่านแหล่งข้อมูลไม่ได้)", col: "", n: 0 }); return; }
        const rangeTxt = va.map((a) => a.sheet + "!" + ref(a.r1, a.c1) + ":" + ref(a.r2, a.c2)).join(", ");
        if (!gName || gTc < 0 || va.some((a) => a.sheet !== gName)) { R.facts.charts.push({ tag: tag, range: rangeTxt, col: "", n: 0 }); return; }
        const cols = new Set<number>(); const rowsUsed: number[] = [];
        va.forEach((a) => { for (let c = a.c1; c <= a.c2; c++) cols.add(c); for (let r = a.r1; r <= a.r2; r++) rowsUsed.push(r); });
        const colList = Array.from(cols); const col = colList[0];
        R.facts.charts.push({ tag: tag, range: rangeTxt, col: colL(col) + " (" + gColName(col) + ")", n: rowsUsed.length });
        const missing = gHourRows.filter((r) => rowsUsed.indexOf(r) < 0), wrong = rowsUsed.filter((r) => gHourRows.indexOf(r) < 0);
        if (!check(R, "charts", !missing.length && !wrong.length && colList.length === 1)) {
          const parts: string[] = [];
          if (missing.length) parts.push("ขาดชั่วโมง " + missing.map((r) => S(cell(gG, r, gTc))).join(", "));
          if (wrong.length) parts.push("มีแถวที่ไม่ใช่รายชั่วโมงปนอยู่ " + wrong.map((r) => ref(r, col)).join(", "));
          if (colList.length > 1) parts.push("ดึงข้อมูลจากหลายคอลัมน์ปนกัน");
          issue(R, "charts", "bad", sn, "กราฟรูปที่ " + (ci + 1), "กราฟดึงข้อมูลรายชั่วโมงไม่ครบหรือผิดแถว", "ช่องข้อมูล " + rangeTxt + ": " + parts.join(" · "));
        }
        const ca = se.cat || [];
        if (ca.length && !check(R, "charts", ca.every((a) => a.sheet === gName && a.c1 === gTc && a.c2 === gTc))) issue(R, "charts", "bad", sn, "กราฟรูปที่ " + (ci + 1), "ป้ายแกนเวลาของกราฟไม่ได้มาจากคอลัมน์ช่วงเวลา", "ป้ายแกนดึงจาก " + ca.map((a) => a.sheet + "!" + ref(a.r1, a.c1) + ":" + ref(a.r2, a.c2)).join(", "));
        if (se.cache.length) {
          const bad: string[][] = [];
          rowsUsed.forEach((r, i) => { const cv = se.cache[i], nv = N(cell(gG, r, col)); if (cv !== undefined && !isNaN(cv) && !close(cv, nv)) bad.push([S(cell(gG, r, gTc)), fmt(cv), fmt(nv)]); });
          if (!check(R, "charts", !bad.length)) issue(R, "charts", "warn", sn, "กราฟรูปที่ " + (ci + 1), "ค่าที่กราฟแสดงไม่ตรงกับตาราง " + bad.length + " จุด", "กราฟอาจยังไม่ได้อัปเดต", { head: ["ช่วงเวลา", "ในกราฟ", "ในตาราง"], rows: bad.slice(0, 12) });
        }
      });
    });
  });
  // ---------- ชื่อทำเล
  if (site) {
    const ns = norm(site);
    book.names.forEach((sn) => {
      if (sn === dName || /^rpt/i.test(sn)) return;
      grid(sn).forEach((row, r) => row.forEach((v, c) => {
        if (typeof v !== "string" || !/ทำเลเป้าหมาย/.test(v) || !/(ตาราง|สรุปผล|จำนวนเฉลี่ย)/.test(v)) return;
        const yrs = (v.match(/25\d\d/g) || []).filter((y) => year && y !== year);
        if (!check(R, "naming", norm(v).indexOf(ns) >= 0 && !yrs.length)) issue(R, "naming", "warn", sn, ref(r, c), "หัวตารางยังเป็นข้อความเก่า", "\"" + S(v) + "\" แต่ทำเลรอบนี้คือ " + site + (year ? " ปี " + year : ""));
      }));
    });
    const stale: string[][] = [];
    book.names.forEach((sn) => {
      if (!/^rpt/i.test(sn)) return;
      const B = grid(sn); let sv = "", dv = "";
      for (let r = 0; r < Math.min(6, B.length); r++) B[r].forEach((v) => {
        const s = S(v); let m: RegExpMatchArray | null;
        if (!sv && (m = s.match(/ชื่อ\s*site\s*จับตัวเลข\s*:\s*(.+)/i)) !== null) sv = m[1].trim();
        if (!dv && (m = s.match(/จับตัวเลขวันที่\s*:\s*(.+)/)) !== null) dv = m[1].trim();
      });
      if (!sv) return;
      if (!check(R, "naming", norm(sv).indexOf(ns) >= 0)) stale.push([sn, sv, dv]);
    });
    if (stale.length) issue(R, "naming", "warn", stale.map((s) => s[0]).join(", "), "หัวชีต", "ชีต RPT " + stale.length + " ชีตเป็นข้อมูลของ site อื่น", "ควรลบออกหรือวางข้อมูลของรอบนี้ทับก่อนส่งรายงาน", { head: ["ชีต", "ชื่อ site ในชีต", "วันที่"], rows: stale });
  }
  // ---------- สำหรับเทียบชีตผลต่าง
  const front = carSecs.filter((x) => /หน้า/.test(x.name))[0] || carSecs[0] || AS;
  R.dayTotals = {
    code: R.facts.code, site: site, dates: dates, backup: R.facts.backup, frontName: front ? front.name.trim() : "",
    days: days.map((b) => { const bi = blocks.indexOf(b); const pv = PSt.v[bi]; const fv2 = front && front.total ? front.total.v[bi] : { m: 0, a: 0, n: 0, t: 0, p: null }; return { p: [pv.m, pv.a, pv.n], front: [fv2.m, fv2.a, fv2.n] }; })
  };
  return R;
}

// ---------------------------------------------------------------- ชีตผลต่าง
export function analyzeDiff(book: Book, R: Res, HOUR_PCT: number, SHIFT_PCT: number) {
  const MIN_P = 10, MIN_C = 100;
  const SHIFTS = new Map<string, number>([["เช้า", 0], ["บ่าย", 1], ["ดึก", 2]]);
  const SHN = ["ผลัดเช้า", "ผลัดบ่าย", "ผลัดดึก"]; const START = [390, 870, 1350];
  let sn = ""; let A: CV[][] = [];
  for (const n of book.names) {
    const g = book.grids.get(n) || [];
    if (g.some((row) => { const ks = row.map((x) => norm(x)); return ks.indexOf("คนผ่าน") >= 0 && ks.indexOf("ผลต่าง") >= 0 && ks.some((k) => SHIFTS.has(k)); })) { sn = n; A = g; break; }
  }
  if (!sn) return;
  interface Side { s: number; p0: number; pD: number; c0: number; cD: number; nC: number; end: number; }
  interface DBlock { shift: number; headerRow: number; sides: Side[]; up: number; uc: number; wp: number; wc: number; hours: number[]; tot: number; }
  const D: DiffRes = { sheet: sn, site: "", code: "", dates: [], backup: "", notes: [], view: [], dayTot: [] };
  R.diff = D;
  // หัวชีต
  const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const dateParts: { d: number; m: string; y: string }[] = [];
  for (let r = 0; r < Math.min(A.length, 8); r++) A[r].forEach((v, c) => {
    const k = norm(v);
    const next = (): CV => { for (let c2 = c + 1; c2 < A[r].length; c2++) if (S(A[r][c2])) return A[r][c2]; return ""; };
    if (k === "รหัสจับตัวเลข" && !D.code) D.code = S(next());
    if (/^site\.?/.test(k) && !D.site) D.site = S(v).replace(/^site\.?\s*/i, "");
    if (/^จับตัวเลขวันที่\d?$/.test(k)) {
      const dv = next();
      if (typeof dv === "number") { const dt = new Date(Math.round((dv - 25569) * 86400000)); const o = { d: dt.getUTCDate(), m: months[dt.getUTCMonth()], y: String(dt.getUTCFullYear() + 543) }; dateParts.push(o); D.dates.push(o.d + " " + o.m + " " + o.y); }
      else D.dates.push(S(dv));
    }
  });
  // บล็อก
  const blocks: DBlock[] = [];
  for (let r = 0; r < A.length; r++) {
    const ks = A[r].map((x) => norm(x));
    if (ks.indexOf("คนผ่าน") < 0) continue;
    const starts: number[] = []; ks.forEach((k, c) => { if (SHIFTS.has(k)) starts.push(c); });
    if (!starts.length) continue;
    const b: DBlock = { shift: SHIFTS.get(ks[starts[0]]) as number, headerRow: r, sides: [], up: -1, uc: -1, wp: -1, wc: -1, hours: [], tot: -1 };
    starts.forEach((s0, si) => {
      const end = si + 1 < starts.length ? starts[si + 1] : ks.length;
      const f = (lab: string, from: number) => { for (let c = from; c < end; c++) if (ks[c] === lab) return c; return -1; };
      const p0 = f("คนผ่าน", s0), pD = f("ผลต่าง", p0 + 1), c0 = f("รถผ่าน", pD + 1), cD = f("ผลต่าง", c0 + 1), nC = f("หมายเหตุ", cD + 1);
      b.sides.push({ s: s0, p0: p0, pD: pD, c0: c0, cD: cD, nC: nC, end: end });
    });
    const last = b.sides[b.sides.length - 1]; const jm: number[] = [];
    for (let c = (last.nC >= 0 ? last.nC : last.cD) + 1; c < ks.length; c++) { if (ks[c] === "จำนวน") jm.push(c); if (ks[c] === "%diffคน") b.wp = c; if (ks[c] === "%diffรถ") b.wc = c; }
    if (jm.length >= 2) { b.up = jm[0]; b.uc = jm[1]; }
    for (let rr = r + 2; rr < A.length; rr++) {
      const lab = cell(A, rr, b.sides[0].s);
      if (norm(lab) === "รวม") { b.tot = rr; break; }
      if (isNum(lab)) b.hours.push(rr); else if (S(lab) && b.hours.length) break;
    }
    blocks.push(b);
  }
  if (!blocks.length) return;
  const nSides = blocks[0].sides.length;
  let grand = -1; for (let r = 0; r < A.length; r++) if (norm(cell(A, r, blocks[0].sides[0].s)) === "ยอดรวม") { grand = r; break; }
  // หมายเหตุ
  const two = (m: number) => { const x = ((m % 1440) + 1440) % 1440; return ("0" + Math.floor(x / 60)).slice(-2) + ":" + ("0" + (x % 60)).slice(-2); };
  const hourTime = (sh: number, h: number) => { const st = START[sh] + (h - 1) * 60; return two(st) + "-" + two(st + 60); };
  const parseTimes = (txt: string): number[][] => {
    const out: number[][] = []; const used: number[][] = []; let m: RegExpExecArray | null;
    const re = /(\d{1,2})[.:](\d{2})\s*(?:-|–|ถึง)\s*(\d{1,2})[.:](\d{2})/g;
    while ((m = re.exec(txt)) !== null) { out.push([parseInt(m[1], 10) * 60 + parseInt(m[2], 10), parseInt(m[3], 10) * 60 + parseInt(m[4], 10)]); used.push([m.index, m.index + m[0].length]); }
    const re2 = /(\d{1,2})[.:](\d{2})/g;
    while ((m = re2.exec(txt)) !== null) { const idx = m.index; if (!used.some((u) => idx >= u[0] && idx < u[1])) { const t = parseInt(m[1], 10) * 60 + parseInt(m[2], 10); out.push([t, t]); } }
    return out;
  };
  const slotsFor = (ranges: number[][]): number[][] => {
    const res: number[][] = [];
    for (let sh = 0; sh < 3; sh++) for (let h = 1; h <= 8; h++) {
      const a = START[sh] + (h - 1) * 60, b = a + 60;
      const hit = ranges.some((q) => { const x = q[0]; let y = q[1]; if (y < x) y += 1440; for (let k = -1; k <= 1; k++) { const xx = x + k * 1440, yy = y + k * 1440; if (xx === yy ? (xx >= a && xx < b) : (xx < b && yy > a)) return true; } return false; });
      if (hit) res.push([sh, h]);
    }
    return res;
  };
  blocks.forEach((b) => b.sides.forEach((sd, si) => { if (sd.nC >= 0) b.hours.forEach((hr, hi) => { const t = S(cell(A, hr, sd.nC)); if (t) D.notes.push({ side: si, sh: b.shift, h: hi + 1, label: "หมายเหตุ", text: t, where: ref(hr, sd.nC) }); }); }));
  const NOTE_LABELS = ["รายละเอียด", "แผงลอย", "ตลาดนัด", "ฝนตก", "ทำถนน", "กินข้าว", "เหตุการณ์พิเศษ", "back", "ไฟดับ", "อุบัติเหตุ"];
  for (let r = 0; r < A.length; r++) {
    blocks[0].sides.forEach((sd, si) => {
      const picks: { c: number; label: string }[] = [];
      for (let c = sd.s; c < sd.end; c++) { const t = S(cell(A, r, c)); if (!t) continue; const k = norm(t).replace(/[.:]$/, ""); if (NOTE_LABELS.some((x) => k.indexOf(x) === 0)) picks.push({ c: c, label: t.replace(/[.:]\s*$/, "") }); }
      picks.forEach((pk, pi) => {
        const stop = pi + 1 < picks.length ? picks[pi + 1].c : sd.end; const val: string[] = [];
        for (let c = pk.c + 1; c < stop; c++) { const t = S(cell(A, r, c)); if (t) val.push(t); }
        const txt = val.join(" ");
        if (/^back/i.test(norm(pk.label))) { if (!D.backup) D.backup = txt; return; }
        if (!txt) return;
        let shOf = -1; blocks.forEach((b) => { if (b.tot >= 0 && r > b.tot && r <= b.tot + 4) shOf = b.shift; });
        const tr = parseTimes(txt);
        if (tr.length) slotsFor(tr).forEach((q) => D.notes.push({ side: si, sh: q[0], h: q[1], label: pk.label, text: txt, where: ref(r, pk.c) }));
        else D.notes.push({ side: si, sh: shOf, h: 0, label: pk.label, text: txt, where: ref(r, pk.c) });
      });
    });
  }
  // คำนวณ
  interface HRow { r: number; written: number; exp: number; }
  interface Calc { rows: HRow[]; last: Map<number, number>; lastSum: number; cD: number; c0: number; }
  const calc = (b: DBlock, sd: Side, kind: string): Calc => {
    const c0 = kind === "p" ? sd.p0 : sd.c0, cD = kind === "p" ? sd.pD : sd.cD;
    const last = new Map<number, number>(); const rows: HRow[] = [];
    b.hours.forEach((hr) => { let exp = 0; for (let c = c0; c < cD; c++) { const v = cell(A, hr, c); if (isNum(v)) { const n = N(v); exp += n - (last.get(c) || 0); last.set(c, n); } } rows.push({ r: hr, written: N(cell(A, hr, cD)), exp: exp }); });
    let lastSum = 0; last.forEach((v) => { lastSum += v; });
    return { rows: rows, last: last, lastSum: lastSum, cD: cD, c0: c0 };
  };
  const sideNames = ["วันที่ 1", "วันที่ 2"]; const hourBad: string[][] = [];
  blocks.forEach((b) => {
    const per = b.sides.map((sd) => ({ p: calc(b, sd, "p"), c: calc(b, sd, "c") }));
    b.sides.forEach((sd, si) => {
      ["p", "c"].forEach((k) => {
        const X = k === "p" ? per[si].p : per[si].c;
        X.rows.forEach((h, hi) => { if (!check(R, "dhour", close(h.written, h.exp))) hourBad.push([sideNames[si] + " " + SHN[b.shift], "ชม. " + (hi + 1) + " (" + hourTime(b.shift, hi + 1) + ")", k === "p" ? "คน" : "รถ", ref(h.r, X.cD), fmt(h.written), fmt(h.exp)]); });
        if (b.tot >= 0) {
          const wTot = N(cell(A, b.tot, X.cD)), sumW = X.rows.reduce((a, h) => a + h.written, 0);
          if (!check(R, "dtotal", close(wTot, X.lastSum))) issue(R, "dtotal", "bad", sn, ref(b.tot, X.cD), sideNames[si] + " " + SHN[b.shift] + ": ยอดรวม" + (k === "p" ? "คน" : "รถ") + " " + fmt(wTot) + " ไม่ตรงกับเลขสะสม", "เลขสะสมสุดท้ายของทุกเครื่องรวมกันได้ " + fmt(X.lastSum) + " · ผลต่างรายชั่วโมงในชีตรวมกันได้ " + fmt(sumW));
          X.last.forEach((lv, c) => { const wv = cell(A, b.tot, c); if (isNum(wv) && !check(R, "dtotal", close(N(wv), lv))) issue(R, "dtotal", "bad", sn, ref(b.tot, c), sideNames[si] + " " + SHN[b.shift] + ": แถวรวมของเครื่อง '" + S(cell(A, b.headerRow + 1, c)) + "' เป็น " + fmt(N(wv)) + " แต่เลขสุดท้ายคือ " + fmt(lv), ""); });
        }
      });
    });
    if (nSides >= 2) {
      const rowsV: DView["rows"] = [];
      b.hours.forEach((hr, hi) => {
        const p1 = per[0].p.rows[hi].written, p2 = per[1].p.rows[hi].written, c1 = per[0].c.rows[hi].written, c2 = per[1].c.rows[hi].written;
        const qs: number[][] = [[b.up, p2 - p1, 0], [b.uc, c2 - c1, 1], [b.wp, pdiff(p1, p2), 2], [b.wc, pdiff(c1, c2), 3]];
        qs.forEach((q) => {
          if (q[0] < 0) return; const w = cell(A, hr, q[0]); if (w === "") return;
          const pct = q[2] >= 2;
          if (!check(R, "dcmp", close(N(w), q[1], pct ? 0.0005 : 0.01))) hourBad.push(["ดิฟสองวัน " + SHN[b.shift], "ชม. " + (hi + 1) + " (" + hourTime(b.shift, hi + 1) + ")", ["จำนวนคน", "จำนวนรถ", "%diff คน", "%diff รถ"][q[2]], ref(hr, q[0]), pct ? pc1(N(w)) : fmt(N(w)), pct ? pc1(q[1]) : fmt(q[1])]);
        });
        const e1 = per[0].p.rows[hi].exp, e2 = per[1].p.rows[hi].exp, f1 = per[0].c.rows[hi].exp, f2 = per[1].c.rows[hi].exp;
        rowsV.push({ h: hi + 1, time: hourTime(b.shift, hi + 1), p: [e1, e2], c: [f1, f2], pw: [p1, p2], cw: [c1, c2], pp: pdiff(e1, e2), cp: pdiff(f1, f2), overP: false, overC: false, notes: [] });
      });
      const tp = [per[0].p.lastSum, per[1].p.lastSum], tc = [per[0].c.lastSum, per[1].c.lastSum];
      D.view.push({ shift: b.shift, rows: rowsV, totP: tp, totC: tc, pp: pdiff(tp[0], tp[1]), cp: pdiff(tc[0], tc[1]) });
    }
  });
  if (hourBad.length) issue(R, "dhour", "bad", sn, hourBad.map((x) => x[3]).slice(0, 4).join(", ") + (hourBad.length > 4 ? " …" : ""), "ผลต่างในชีตไม่ตรงกับการคำนวณ " + hourBad.length + " ช่อง", "ผลต่างรายชั่วโมงควรเท่ากับเลขสะสมที่เพิ่มขึ้นจากชั่วโมงก่อนของเครื่องเดียวกัน ช่องที่ผิดทำให้ยอดรวมและ %diff ผิดตาม", { head: ["ฝั่ง/ผลัด", "ชั่วโมง", "รายการ", "ช่อง", "ในชีต", "ควรเป็น"], rows: hourBad });
  for (let si = 0; si < Math.min(2, nSides); si++) {
    let p = 0, c = 0, pw = 0, cw = 0;
    blocks.forEach((b) => { const sd = b.sides[si]; if (!sd || b.tot < 0) return; p += calc(b, sd, "p").lastSum; c += calc(b, sd, "c").lastSum; pw += N(cell(A, b.tot, sd.pD)); cw += N(cell(A, b.tot, sd.cD)); });
    D.dayTot.push({ p: p, c: c, pw: pw, cw: cw });
  }
  if (grand >= 0) {
    blocks[0].sides.forEach((sd, si) => {
      if (si > 1) return;
      [[sd.p0, 0], [sd.c0, 1]].forEach((q) => {
        const w = N(cell(A, grand, q[0])), want = q[1] === 0 ? D.dayTot[si].p : D.dayTot[si].c, sumW = q[1] === 0 ? D.dayTot[si].pw : D.dayTot[si].cw;
        if (!check(R, "dtotal", close(w, want))) issue(R, "dtotal", "bad", sn, ref(grand, q[0]), sideNames[si] + ": ยอดรวม" + (q[1] === 0 ? "คน" : "รถ") + "ทั้งวัน " + fmt(w) + " ไม่ตรงกับเลขสะสม (" + fmt(want) + ")", "รวมยอดรวมของ 3 ผลัดในชีตได้ " + fmt(sumW) + " ถ้าแก้ผลต่างที่ผิดแล้ว ยอดทั้งวันควรเป็น " + fmt(want));
      });
    });
    if (nSides >= 2) [[blocks[0].up, D.dayTot[1].p - D.dayTot[0].p, 0], [blocks[0].uc, D.dayTot[1].c - D.dayTot[0].c, 1]].forEach((q) => {
      if (q[0] < 0) return; const w = cell(A, grand, q[0]);
      if (!check(R, "dcmp", isNum(w) && close(N(w), q[1]))) issue(R, "dcmp", "bad", sn, ref(grand, q[0]), "แถวยอดรวม: จำนวนดิฟ" + (q[2] === 0 ? "คน" : "รถ") + " เป็น " + (S(w) || "ว่าง") + " ควรเป็น " + fmt(q[1]), "ยอดรวมทั้งวัน วันที่ 1 กับวันที่ 2 ต่างกัน " + fmt(q[1]) + (isNum(w) && N(w) === 0 ? " แต่ในชีตเป็น 0 น่าจะยังไม่ได้ใส่สูตร" : ""));
    });
  }
  // ดิฟเกินเกณฑ์
  const notesFor = (sh: number, h: number) => D.notes.filter((n) => (n.sh === sh && (n.h === h || n.h === 0)) || (n.sh < 0 && n.h === 0));
  const noNote: string[][] = [];
  D.view.forEach((v) => {
    v.rows.forEach((x) => {
      x.overP = x.pp > HOUR_PCT && Math.abs(x.p[1] - x.p[0]) >= MIN_P; x.overC = x.cp > HOUR_PCT && Math.abs(x.c[1] - x.c[0]) >= MIN_C;
      x.notes = notesFor(v.shift, x.h);
      if (x.overP || x.overC) { if (!check(R, "dnote", x.notes.length > 0)) noNote.push([SHN[v.shift], x.time, x.overP ? fmt(x.p[0]) + " → " + fmt(x.p[1]) + " (" + pc1(x.pp) + ")" : "–", x.overC ? fmt(x.c[0]) + " → " + fmt(x.c[1]) + " (" + pc1(x.cp) + ")" : "–"]); }
    });
  });
  if (noNote.length) issue(R, "dnote", "warn", sn, "ช่องหมายเหตุ", "ดิฟเกิน " + Math.round(HOUR_PCT * 100) + "% แต่ไม่มีหมายเหตุอธิบาย " + noNote.length + " ชั่วโมง", "ควรเขียนสาเหตุในช่องหมายเหตุ หรือในแถวแผงลอย/ตลาดนัด/ฝนตก/ทำถนน/กินข้าว/เหตุการณ์พิเศษ พร้อมเวลา (นับเฉพาะชั่วโมงที่ต่างกันอย่างน้อย " + MIN_P + " คน หรือ " + MIN_C + " คัน)", { head: ["ผลัด", "เวลา", "คน วันที่ 1 → 2", "รถ วันที่ 1 → 2"], rows: noNote });
  // เทียบกับ data
  const T = R.dayTotals;
  if (T) {
    if (!check(R, "ddata", norm(T.code) === norm(D.code))) issue(R, "ddata", "bad", sn, "หัวชีต", "ชีตผลต่างเป็นคนละทำเลกับรายงาน", "รหัสในชีตผลต่าง " + (D.code || "-") + (D.site ? " (" + D.site + ")" : "") + " แต่รายงานคือ " + (T.code || "-") + " (" + T.site + ") จึงไม่ได้เทียบตัวเลข");
    else {
      const rowsX: string[][] = [];
      blocks.forEach((b) => { for (let si = 0; si < Math.min(2, nSides); si++) {
        if (!T.days[si] || b.tot < 0) continue;
        const sd = b.sides[si], wp = N(cell(A, b.tot, sd.pD)), wc = N(cell(A, b.tot, sd.cD)), dp = T.days[si].p[b.shift], dc = T.days[si].front[b.shift];
        const okP = check(R, "ddata", close(wp, dp)), okC = check(R, "ddata", close(wc, dc));
        if (!okP || !okC) rowsX.push([sideNames[si], SHN[b.shift], fmt(wp) + " / " + fmt(dp), fmt(wc) + " / " + fmt(dc)]);
      } });
      if (rowsX.length) issue(R, "ddata", "bad", sn, "แถวรวมของแต่ละผลัด", "ยอดในชีตผลต่างไม่ตรงกับชีต data " + rowsX.length + " ผลัด", "เทียบยอดคนกับ \"จำนวนคน (ยอดรวม)\" และยอดรถกับ \"" + T.frontName + "\" (ตัวเลข: ชีตผลต่าง / data)", { head: ["วัน", "ผลัด", "คน", "รถ"], rows: rowsX });
      if (D.backup && T.backup && !check(R, "ddata", norm(D.backup) === norm(T.backup))) issue(R, "ddata", "warn", sn, "Back.", "สภาพ Back Up ไม่ตรงกับชีต data", "ชีตผลต่าง: \"" + D.backup + "\" · data: \"" + T.backup + "\"");
      dateParts.forEach((dt, i) => { const t = T.dates[i]; if (!t) return; if (!check(R, "ddata", new RegExp("(^|\\D)" + dt.d + "(\\D|$)").test(t) && t.indexOf(dt.m) >= 0 && t.indexOf(dt.y) >= 0)) issue(R, "ddata", "warn", sn, "วันที่", "วันที่ " + (i + 1) + " ในชีตผลต่างไม่ตรงกับ data", "ชีตผลต่าง: " + D.dates[i] + " · data: " + t); });
    }
  }
}

