/* เซิร์ฟเวอร์: เสิร์ฟหน้าเว็บ และ /api/explain ที่ให้ Gemini อธิบายผลตรวจ (คีย์อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น) */
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const prod = process.env.NODE_ENV === "production";

const SYSTEM = [
  "คุณเป็นผู้ช่วยตรวจรายงานจับตัวเลขทำเล (นับคนเดินผ่านและรถผ่านหน้าทำเลเป้าหมาย 2 วัน แบ่ง 3 ผลัด) ของทีมสำรวจทำเลร้านสะดวกซื้อ",
  "ข้อมูลที่ได้รับคือผลตรวจที่โปรแกรมคำนวณแล้ว ตัวเลขทุกตัวถูกต้องตามที่โปรแกรมคำนวณ",
  "กติกา: ห้ามคำนวณตัวเลขใหม่ ห้ามแต่งตัวเลขที่ไม่มีในข้อมูล อ้างตัวเลขได้เฉพาะที่ให้มา",
  "ห้ามสรุปสาเหตุของดิฟเป็นข้อเท็จจริงถ้าไม่มีหมายเหตุรองรับ ให้เขียนเป็น 'อาจเป็นเพราะ… ควรถามทีมหน้างาน' แทน",
  "ตอบเป็นภาษาไทย สั้น กระชับ ใช้หัวข้อดังนี้:",
  "## สรุปภาพรวม (2–3 ประโยค)",
  "## ต้องแก้ก่อนส่งรายงาน (เรียงตามผลกระทบต่อตัวเลขที่ลงรายงาน ระบุชีตและช่อง)",
  "## ผลดิฟสองวัน (ถ้ามี: อธิบายชั่วโมงที่ดิฟเกินเกณฑ์ โยงกับหมายเหตุที่มี และชี้ชั่วโมงที่ยังไม่มีหมายเหตุ)",
  "## ร่างหมายเหตุที่ควรเติม (ถ้ามีชั่วโมงที่ไม่มีหมายเหตุ: ร่างข้อความสั้นพร้อมเวลา ใส่ [ ] ตรงที่ทีมต้องเติมเอง)"
].join("\n");

async function start() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.post("/api/explain", async (req, res) => {
    const key = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!key) { res.status(500).json({ error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY" }); return; }
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const r = await ai.models.generateContent({
        model: MODEL,
        contents: "ผลตรวจ (JSON):\n" + JSON.stringify(req.body).slice(0, 60000),
        config: { systemInstruction: SYSTEM, temperature: 0.2 }
      });
      res.json({ text: r.text || "" });
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  if (prod) {
    const dist = path.join(__dirname, "dist");
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }
  app.listen(PORT, () => console.log("พร้อมใช้งานที่ http://localhost:" + PORT));
}
start();
