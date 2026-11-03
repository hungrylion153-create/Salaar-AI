import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import PDFDocument from "pdfkit";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.static("."));

const GROQ_KEY = process.env.GROQ_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GROQ_MODEL = process.env.GROQ_TEXT_MODEL || "openai/gpt-oss-120b";

// LIST AVAILABLE MODELS FOR YOUR AQ. KEY
async function listGeminiModels() {
  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models";
    const res = await fetch(url, {
      headers: { "x-goog-api-key": GEMINI_KEY }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message);
    return data.models?.map(m => m.name.replace("models/","")) || [];
  } catch (e) {
    console.log("ListModels failed:", e.message);
    return [];
  }
}

async function callGemini(prompt, images = [], pdfBuffer = null) {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY missing");
  
  const parts = [{ text: prompt || "Analyze" }];
  for (const img of images) {
    parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } });
  }
  if (pdfBuffer) {
    parts.push({ inline_data: { mime_type: "application/pdf", data: pdfBuffer.toString("base64") } });
  }

  // 1. Get real models available for THIS key
  let available = await listGeminiModels();
  console.log("Available models for your key:", available);

  // 2. Preferred order for 2026 AQ. keys
  const preferred = [
    "gemini-3.8-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-1.5-flash-002",
    "gemini-1.5-flash",
    "gemini-1.5-flash-001",
    "gemini-flash-latest"
  ];

  // 3. Use intersection of available + preferred, or try preferred anyway
  let toTry = available.length > 0 ? preferred.filter(p => available.includes(p)).concat(available.filter(m => m.includes("flash"))) : preferred;
  // dedup
  toTry = [...new Set(toTry)];

  let lastError = null;
  for (const model of toTry) {
    try {
      console.log(`→ Trying ${model} ...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
        })
      });
      const data = await res.json();
      if (!res.ok) {
        lastError = data.error?.message || res.statusText;
        console.log(`  ✗ ${model} failed: ${lastError.slice(0,150)}`);
        continue;
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        console.log(`  ✅ SUCCESS with ${model}`);
        return text;
      }
    } catch (e) { lastError = e.message; continue; }
  }
  throw new Error(`Gemini all models failed: ${lastError}. Available: ${available.join(', ')}. Get new key: https://aistudio.google.com/app/apikey`);
}

async function callGroq(prompt) {
  if (!GROQ_KEY) throw new Error("GROQ_API_KEY missing");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: "You are Salaar AI. Created by Yahya Salaar Hassan. Plain text only, no ** # *" },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 4000
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Groq ${res.status}`);
  return data.choices?.[0]?.message?.content;
}

app.get("/api/status", async (req, res) => {
  let groqOk = false, geminiOk = false, list = [];
  try { await callGroq("hi"); groqOk = true; } catch {}
  try { list = await listGeminiModels(); geminiOk = list.length > 0; } catch {}
  res.json({ connected: groqOk || geminiOk, groq: groqOk, gemini: geminiOk, availableModels: list, groqModel: GROQ_MODEL });
});

app.post("/api/chat", upload.array("files", 5), async (req, res) => {
  try {
    const prompt = req.body.message || "";
    const images = []; let pdfBuffer = null;
    if (req.files) {
      for (const f of req.files) {
        if (f.mimetype.startsWith("image/")) images.push({ base64: f.buffer.toString("base64"), mime: f.mimetype });
        else if (f.mimetype === "application/pdf") pdfBuffer = f.buffer;
      }
    }
    if (!prompt && images.length===0 && !pdfBuffer) return res.status(400).json({ error: "Message required" });
    let reply;
    if (images.length > 0 || pdfBuffer) {
      reply = await callGemini(prompt || "What is in this image?", images, pdfBuffer);
    } else {
      try { reply = await callGroq(prompt); }
      catch { reply = await callGemini(prompt); }
    }
    reply = reply.replace(/\*\*(.*?)\*\*/g, "$1");
    res.json({ reply });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.post("/api/analyze-pdf", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No PDF" });
    const q = req.body.question || "Summarize this PDF";
    const answer = await callGemini(q, [], req.file.buffer);
    res.json({ reply: answer });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/create-pdf", (req, res) => {
  const { content, title } = req.body;
  if (!content) return res.status(400).json({ error: "Content required" });
  const doc = new PDFDocument();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${(title||'doc').replace(/[^a-z0-9]/gi,'_')}.pdf"`);
  doc.pipe(res); doc.fontSize(20).text(title || "Salaar AI"); doc.moveDown(); doc.fontSize(12).text(content); doc.end();
});

// For Vercel - Don't listen in production, export app
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => console.log(`✅ Salaar AI http://localhost:${PORT} - Groq: ${GROQ_MODEL} - Gemini 3.8-flash - AQ. Supported`));
}

export default app;