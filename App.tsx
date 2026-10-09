import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeReport, analyzeDiff, Res, Issue, DView, DNote } from "./engine/core";
import { readBook, LoadedFile } from "./engine/readBook";

const SHN = ["ผลัดเช้า", "ผลัดบ่าย", "ผลัดดึก"];
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const p1 = (x: number) => (x * 100).toFixed(1) + "%";

function runChecks(files: LoadedFile[], thr: number): Res {
  const rep = files.find((f) => f.book.names.some((n) => n.trim().toLowerCase() === "data"));
  const R = analyzeReport(rep ? rep.book : { names: [], grids: new Map(), texts: new Map(), charts: new Map() });
  for (const f of files) { analyzeDiff(f.book, R, thr / 100, 0.1); if (R.diff) break; }
  if (!rep && !R.diff) R.fatal = "ไม่พบชีต data หรือชีตผลต่างในไฟล์ที่วาง";
  else if (!rep) R.fatal = "";
  return R;
}

function useDone(key: string) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => { try { setDone(JSON.parse(localStorage.getItem(key) || "{}") || {}); } catch { setDone({}); } }, [key]);
  const toggle = (k: string, v: boolean) => setDone((d) => { const n = { ...d, [k]: v }; try { localStorage.setItem(key, JSON.stringify(n)); } catch { /* ข้าม */ } return n; });
  return { done, toggle };
}

export default function App() {
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [thr, setThr] = useState(20);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [over, setOver] = useState(false);
  const [ai, setAi] = useState<{ state: "idle" | "loading" | "done" | "error"; text: string }>({ state: "idle", text: "" });
  const inputRef = useRef<HTMLInputElement>(null);

  const R = useMemo(() => (files.length ? runChecks(files, thr) : null), [files, thr]);
  const key = "site-check:" + (R ? R.facts.record || R.facts.code || (R.diff ? R.diff.code : "") : "");
  const { done, toggle } = useDone(key);
  useEffect(() => setAi({ state: "idle", text: "" }), [R]);

  async function handle(list: FileList | null) {
    if (!list || !list.length) return;
    setErr(""); setBusy("กำลังตรวจ " + Array.from(list).map((f) => f.name).join(", ") + " …");
    try {
      const loaded: LoadedFile[] = [];
      for (const f of Array.from(list)) loaded.push({ name: f.name, book: readBook(new Uint8Array(await f.arrayBuffer())) });
      setFiles(loaded);
    } catch (e) { setErr("เปิดไฟล์ไม่ได้ (" + (e instanceof Error ? e.message : String(e)) + ") ลองบันทึกเป็น .xlsx แล้ววางใหม่"); }
    setBusy("");
  }

  const issueKey = (i: Issue) => i.rule + "|" + i.where + "|" + i.title;
  const issues = R ? R.issues.slice().sort((a, b) => (a.level === "bad" ? 0 : 1) - (b.level === "bad" ? 0 : 1)) : [];
  const shown = issues.filter((i) => filter === "all" || (filter === "open" ? !done[issueKey(i)] : i.level === filter));
  let checked = 0, failed = 0;
  if (R) R.order.forEach((k) => { const r = R.rules.get(k); if (r) { checked += r.checked; failed += r.failed; } });
  const bad = issues.filter((i) => i.level === "bad").length, warn = issues.length - bad;
  const site = R ? R.facts.site || (R.diff ? R.diff.site : "") : "";

  function summaryText(): string {
    if (!R) return "";
    const out = ["ผลตรวจ " + site + (R.facts.record ? " (" + R.facts.record + ")" : ""), "ผิด " + bad + " จุด · ควรเช็ค " + warn + " จุด"];
    issues.forEach((i) => out.push("- [" + (i.level === "bad" ? "ผิด" : "ควรเช็ค") + "] [" + i.sheet + (i.where ? " " + i.where : "") + "] " + i.title));
    return out.join("\n");
  }
  async function copy() { try { await navigator.clipboard.writeText(summaryText()); setBusy("คัดลอกแล้ว"); setTimeout(() => setBusy(""), 2000); } catch { setBusy("คัดลอกไม่ได้ ลองเลือกข้อความเอง"); } }

  async function explain() {
    if (!R) return;
    setAi({ state: "loading", text: "" });
    const payload = {
      site, code: R.facts.code || (R.diff ? R.diff.code : ""), dates: R.facts.dates.length ? R.facts.dates : (R.diff ? R.diff.dates : []),
      tally: { checked, ok: checked - failed, bad, warn },
      issues: issues.slice(0, 40).map((i) => ({ level: i.level === "bad" ? "ผิด" : "ควรเช็ค", sheet: i.sheet, where: i.where, title: i.title, detail: i.detail, table: i.table ? [i.table.head].concat(i.table.rows.slice(0, 12)) : null })),
      diff: R.diff ? {
        site: R.diff.site, backup: R.diff.backup, threshold: thr + "%",
        shifts: R.diff.view.map((v) => ({ shift: SHN[v.shift], people: v.totP, cars: v.totC, pctPeople: p1(v.pp), pctCars: p1(v.cp),
          flagged: v.rows.filter((x) => x.overP || x.overC).map((x) => ({ time: x.time, people: x.p, cars: x.c, pctPeople: p1(x.pp), pctCars: p1(x.cp), notes: x.notes.map((n) => "วันที่ " + (n.side + 1) + ": " + n.label + (n.label !== n.text ? " " + n.text : "")) })) })),
        notes: R.diff.notes.map((n) => "วันที่ " + (n.side + 1) + " " + (n.sh >= 0 ? SHN[n.sh] + (n.h ? " ชม. " + n.h : "") : "ทั้งวัน") + ": " + n.label + (n.label !== n.text ? " " + n.text : ""))
      } : null
    };
    try {
      const res = await fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !j.text) throw new Error(j.error || "ไม่มีคำตอบ");
      setAi({ state: "done", text: j.text });
    } catch (e) { setAi({ state: "error", text: e instanceof Error ? e.message : String(e) }); }
  }

  return (
    <div className="wrap">
      <header>
        <span className="eyebrow">ตรวจรายงานจับตัวเลขทำเล</span>
        <h1>ตัวตรวจรายงานจับตัวเลข</h1>
        <p className="lead">วางไฟล์รายงานและไฟล์ผลต่าง แอพจะตรวจยอดรวม ค่าเฉลี่ย % ข้อความสรุป กล่องข้อความบนแผนที่ กราฟ และผลดิฟสองวัน ตัวเลขทุกตัวคำนวณจากไฟล์ จากนั้นให้ Gemini ช่วยอธิบายผลได้</p>
      </header>

      <label className={"drop" + (over ? " over" : "")} htmlFor="file"
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}>
        <input ref={inputRef} type="file" id="file" accept=".xls,.xlsx,.xlsm" multiple onChange={(e) => { handle(e.target.files); e.target.value = ""; }} />
        <b>ลากไฟล์มาวางที่นี่ หรือกดเพื่อเลือกไฟล์</b>
        <span>วางไฟล์รายงาน ไฟล์ผลต่าง หรือทั้งสองไฟล์พร้อมกัน (.xls / .xlsx) · ไฟล์ถูกอ่านในเบราว์เซอร์นี้</span>
      </label>
      {busy && <p className="status">{busy}</p>}
      {err && <div className="fatal">{err}</div>}
      {R && R.fatal && <div className="fatal">อ่านโครงสร้างไฟล์ไม่ได้: {R.fatal}</div>}

      {R && (!R.fatal || R.diff) && (
        <>
          <div className="filehead">
            <div className="row"><h2>{site || "(ไม่พบชื่อทำเล)"}</h2><span className="where">{files.map((f) => f.name).join(" + ")}</span></div>
            <div className="facts">
              {[["รหัส", R.facts.code || (R.diff ? R.diff.code : "")], ["บันทึกเลขที่", R.facts.record], ["จับตัวเลข", (R.facts.dates.length ? R.facts.dates : R.diff ? R.diff.dates : []).join(" และ ")], ["จุดจับ", R.facts.point], ["ผู้รับผิดชอบ", R.facts.owner]]
                .filter((x) => x[1]).map((x) => <span key={x[0]}>{x[0]} <b>{x[1]}</b></span>)}
            </div>
          </div>
          <div className="tally" role="group" aria-label="สรุปผลตรวจ">
            <div><span className="v num">{checked.toLocaleString("en-US")}</span><span className="k">จุดที่ตรวจ</span></div>
            <div className="ok"><span className="v num">{(checked - failed).toLocaleString("en-US")}</span><span className="k">ตรงกัน</span></div>
            <div className="bad"><span className="v num">{bad}</span><span className="k">ผิด ต้องแก้</span></div>
            <div className="warn"><span className="v num">{warn}</span><span className="k">ควรเช็ค</span></div>
          </div>

          <section className="aibox">
            <div className="bar">
              <h2>ให้ Gemini อธิบายผล</h2>
              <button className="btn" onClick={explain} disabled={ai.state === "loading"}>{ai.state === "loading" ? "กำลังเขียนคำอธิบาย…" : ai.state === "done" ? "เขียนใหม่" : "อธิบายผลตรวจ"}</button>
            </div>
            <p className="where">ส่งเฉพาะผลตรวจที่สรุปแล้วไปให้ Gemini ไม่ได้ส่งไฟล์ Excel · Gemini อธิบายและแนะนำเท่านั้น ตัวเลขในผลตรวจมาจากโปรแกรม</p>
            {ai.state === "done" && <div className="aitext" dangerouslySetInnerHTML={{ __html: mini(ai.text) }} />}
            {ai.state === "error" && <div className="fatal">เรียก Gemini ไม่สำเร็จ: {ai.text}</div>}
          </section>

          <section>
            <div className="bar">
              <h2>จุดที่ต้องดู</h2>
              <div className="chips" role="group" aria-label="กรอง">
                {[["all", "ทั้งหมด"], ["bad", "ผิด"], ["warn", "ควรเช็ค"], ["open", "ยังไม่แก้"]].map((c) => (
                  <button key={c[0]} id={"f-" + c[0]} className="chip" aria-pressed={filter === c[0]} onClick={() => setFilter(c[0])}>{c[1]}</button>))}
              </div>
            </div>
            <div className="bar">
              <p className="progress">แก้แล้ว {issues.filter((i) => done[issueKey(i)]).length} จาก {issues.length}</p>
              <button className="btn ghost" onClick={copy}>คัดลอกสรุป</button>
            </div>
            <div className="issues">
              {!issues.length && <div className="empty-ok">ไม่พบจุดผิด ตัวเลขทุกชีตตรงกัน</div>}
              {shown.map((i, idx) => {
                const k = issueKey(i), d = !!done[k];
                return (
                  <article key={k + idx} className={"issue " + i.level + (d ? " is-done" : "")}>
                    <div className="ihead"><span className={"pill " + i.level}>{i.level === "bad" ? "ผิด" : "ควรเช็ค"}</span><h3>{i.title}</h3><span className="where">{i.sheet}{i.where && <> · <code>{i.where}</code></>}</span></div>
                    {i.detail && <p>{i.detail}</p>}
                    {i.table && (
                      <div className="tablebox"><table className="mini"><thead><tr>{i.table.head.map((h, hi) => <th key={hi}>{h}</th>)}</tr></thead>
                        <tbody>{i.table.rows.map((row, ri) => <tr key={ri} className={i.table && i.table.hl === ri ? "hl" : ""}>{row.map((v, vi) => <td key={vi} className={vi && /^[\d,.\-%→ ()]+$/.test(v) ? "r num" : ""}>{v}</td>)}</tr>)}</tbody></table></div>)}
                    <label className="done"><input type="checkbox" checked={d} onChange={(e) => toggle(k, e.target.checked)} /> แก้แล้ว</label>
                  </article>);
              })}
            </div>
            <div className="notes">
              {R.facts.shapeCount > 0 && <p>หมายเหตุ: อ่านข้อความในกล่องข้อความและแผนที่ {R.facts.shapeCount} กล่อง</p>}
              {R.notes.map((n, i) => <p key={i}>หมายเหตุ: {n}</p>)}
            </div>
          </section>

          {R.diff && R.diff.view.length > 0 && (
            <section>
              <div className="bar">
                <h2>ผลดิฟ วันที่ 1 กับวันที่ 2</h2>
                <label className="where" htmlFor="thr">เกณฑ์ดิฟรายชั่วโมง <input id="thr" type="number" min={1} max={100} value={thr} onChange={(e) => setThr(Math.max(1, parseFloat(e.target.value) || 20))} className="thr" /> %</label>
              </div>
              <p className="where">ชีต {R.diff.sheet} · {R.diff.site && "ทำเล " + R.diff.site + " · "}{R.diff.code}{R.diff.dates.map((d, i) => " · วันที่ " + (i + 1) + ": " + d).join("")}{R.diff.backup && " · Back: " + R.diff.backup} · ตัวเลขคำนวณจากเลขสะสม ช่องสีแดงคือค่าที่ต่างจากในชีต</p>
              {R.diff.view.map((v) => <DiffTable key={v.shift} v={v} />)}
              {R.diff.dayTot.length > 1 && <p className="where">ทั้งวัน: คน {fmt(R.diff.dayTot[0].p)} → {fmt(R.diff.dayTot[1].p)} · รถ {fmt(R.diff.dayTot[0].c)} → {fmt(R.diff.dayTot[1].c)}</p>}
              {R.diff.notes.length > 0 && (
                <div><h3>หมายเหตุที่พบในชีต</h3><div className="notelist">
                  {uniqueNotes(R.diff.notes).map((n, i) => <div key={i}><span className="tag">วันที่ {n.side + 1}</span>{n.label}{n.label !== n.text && ": " + n.text} <span className="where">· {n.where} · {n.sh >= 0 ? SHN[n.sh] + (n.h ? " ชม. " + n.h : "") : "ทั้งวัน"}</span></div>)}
                </div></div>)}
            </section>)}

          {R.facts.charts.length > 0 && (
            <section>
              <h2>กราฟที่ตรวจ</h2>
              <div className="tablebox"><table><thead><tr><th>กราฟ</th><th>ดึงข้อมูลจาก</th><th>คอลัมน์</th><th className="r">จุด</th></tr></thead>
                <tbody>{R.facts.charts.map((c, i) => <tr key={i}><td>{c.tag}</td><td className="num">{c.range}</td><td>{c.col || "–"}</td><td className="r num">{c.n || "–"}</td></tr>)}</tbody></table></div>
            </section>)}

          <section>
            <h2>กฎที่ตรวจ</h2>
            <div className="tablebox"><table><thead><tr><th>กฎ</th><th>ชีต</th><th className="r">จุดที่ตรวจ</th><th>ผล</th></tr></thead>
              <tbody>{R.order.map((k) => {
                const r = R.rules.get(k); if (!r) return null;
                if (!r.checked && !files.some((f) => f.book.names.some((n) => n.trim().toLowerCase() === "data")) && !k.startsWith("d")) return null;
                return <tr key={k}><td>{r.name}</td><td>{r.sheet}</td><td className="r num">{r.checked.toLocaleString("en-US")}</td><td>
                  {!r.checked ? <span className="pill idle">ไม่มีข้อมูลให้ตรวจ</span> : r.bad ? <><span className="pill bad">ผิด {r.bad}</span>{r.warn > 0 && <> <span className="pill warn">ควรเช็ค {r.warn}</span></>}</> : r.warn ? <span className="pill warn">ควรเช็ค {r.warn}</span> : <span className="pill ok">ผ่าน</span>}
                </td></tr>;
              })}</tbody></table></div>
          </section>
        </>
      )}
      <footer>
        <p>แอพหาแถวจากชื่อหัวข้อ แถวจะขยับหรือเพิ่มก็ตรวจได้ ถ้าหาหัวข้อที่ต้องใช้ไม่เจอ จะแจ้งว่าอ่านโครงสร้างไม่ได้ แทนการรายงานผลผิด</p>
        <p>ช่อง "แก้แล้ว" จำไว้ในเบราว์เซอร์นี้เท่านั้น</p>
      </footer>
    </div>
  );
}

function uniqueNotes(ns: DNote[]): DNote[] { const seen = new Set<string>(); return ns.filter((n) => { const k = n.side + n.label + n.text + n.where; if (seen.has(k)) return false; seen.add(k); return true; }); }

function DiffTable({ v }: { v: DView }) {
  const cellN = (e: number, w: number) => { const b = Math.abs(e - w) > 0.01; return <td className={"r num" + (b ? " fix" : "")}>{fmt(e)}{b && <small>ในชีต {fmt(w)}</small>}</td>; };
  const nt = (ns: DNote[]) => ns.map((n, i) => <div key={i}><span className="tag">วัน {n.side + 1}</span>{n.label}{n.label !== n.text && ": " + n.text}</div>);
  return (
    <div className="dgroup"><h3>{SHN[v.shift]}</h3>
      <div className="tablebox"><table className="dtab"><thead><tr><th>ชม.</th><th>เวลา</th><th className="r">คน วัน 1</th><th className="r">คน วัน 2</th><th className="r">%diff</th><th className="r">รถ วัน 1</th><th className="r">รถ วัน 2</th><th className="r">%diff</th><th>หมายเหตุประกอบ</th></tr></thead>
        <tbody>
          {v.rows.map((x) => (
            <tr key={x.h}><td className="num">{x.h}</td><td className="num">{x.time}</td>{cellN(x.p[0], x.pw[0])}{cellN(x.p[1], x.pw[1])}<td className={"r num" + (x.overP ? " hi" : "")}>{p1(x.pp)}</td>{cellN(x.c[0], x.cw[0])}{cellN(x.c[1], x.cw[1])}<td className={"r num" + (x.overC ? " hi" : "")}>{p1(x.cp)}</td>
              <td className="note">{x.notes.length ? nt(x.notes) : (x.overP || x.overC) ? <span className="nonote">ไม่มีหมายเหตุ</span> : null}</td></tr>))}
          <tr className="sum"><td colSpan={2}>รวม{SHN[v.shift].replace("ผลัด", "")}</td><td className="r num">{fmt(v.totP[0])}</td><td className="r num">{fmt(v.totP[1])}</td><td className="r num">{p1(v.pp)}</td><td className="r num">{fmt(v.totC[0])}</td><td className="r num">{fmt(v.totC[1])}</td><td className="r num">{p1(v.cp)}</td><td></td></tr>
        </tbody></table></div></div>);
}

/* แปลงข้อความจาก Gemini แบบปลอดภัย: escape ก่อน แล้วรองรับแค่ หัวข้อ ตัวหนา และรายการ */
function mini(md: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" } as Record<string, string>)[c]);
  const out: string[] = []; let inList = false;
  md.split(/\n/).forEach((raw) => {
    let l = esc(raw).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    const li = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    const h = l.match(/^#{1,4}\s+(.*)$/);
    if (li) { if (!inList) { out.push("<ul>"); inList = true; } out.push("<li>" + li[1] + "</li>"); return; }
    if (inList) { out.push("</ul>"); inList = false; }
    if (h) out.push("<h4>" + h[1] + "</h4>"); else if (l.trim()) out.push("<p>" + l + "</p>");
  });
  if (inList) out.push("</ul>");
  return out.join("");
}
