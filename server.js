const express = require("express");
const multer = require("multer");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 5050;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data", "flyers.json");
const FLYER_DIR = path.join(ROOT, "uploads", "flyers");

app.use(express.json());
app.use(express.static(path.join(ROOT, "public")));
app.use("/flyers", express.static(FLYER_DIR));

async function ensureStorage() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.mkdir(FLYER_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]\n", "utf8");
  }
}

async function readFlyers() {
  await ensureStorage();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  return JSON.parse(raw || "[]");
}

async function writeFlyers(flyers) {
  await fs.writeFile(DATA_FILE, `${JSON.stringify(flyers, null, 2)}\n`, "utf8");
}

function requireAdmin(req, res, next) {
  if (req.get("x-admin-password") === ADMIN_PASSWORD) {
    return next();
  }

  return res.status(401).json({ message: "Admin-Passwort fehlt oder ist falsch." });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, FLYER_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".pdf";
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const isPdf = file.mimetype === "application/pdf" || path.extname(file.originalname).toLowerCase() === ".pdf";
    cb(isPdf ? null : new Error("Nur PDF-Dateien sind erlaubt."), isPdf);
  }
});

app.get("/api/flyers", async (_req, res, next) => {
  try {
    const flyers = await readFlyers();
    res.json(
      flyers.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/login", (req, res) => {
  if (req.body?.password === ADMIN_PASSWORD) {
    return res.json({ ok: true });
  }

  return res.status(401).json({ message: "Das Passwort ist falsch." });
});

app.post("/api/flyers", requireAdmin, upload.single("flyer"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Bitte eine PDF-Datei auswaehlen." });
    }

    const flyers = await readFlyers();
    const uploadedAt = new Date().toISOString();
    const title = (req.body.title || "").trim() || "Aktueller Wochenflyer";
    const flyer = {
      id: crypto.randomUUID(),
      title,
      description: (req.body.description || "").trim(),
      validUntil: req.body.validUntil || "",
      originalName: req.file.originalname,
      filename: req.file.filename,
      url: `/flyers/${req.file.filename}`,
      uploadedAt
    };

    flyers.unshift(flyer);
    await writeFlyers(flyers);
    return res.status(201).json(flyer);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/flyers/:id", requireAdmin, async (req, res, next) => {
  try {
    const flyers = await readFlyers();
    const flyer = flyers.find((item) => item.id === req.params.id);

    if (!flyer) {
      return res.status(404).json({ message: "Flyer wurde nicht gefunden." });
    }

    await fs.rm(path.join(FLYER_DIR, flyer.filename), { force: true });
    await writeFlyers(flyers.filter((item) => item.id !== req.params.id));
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error instanceof multer.MulterError ? 400 : 500;
  res.status(status).json({
    message: error.message || "Ein Serverfehler ist aufgetreten."
  });
});

ensureStorage().then(() => {
  app.listen(PORT, () => {
    console.log(`Supermarkt-Webseite laeuft auf http://localhost:${PORT}`);
    console.log(`Adminseite: http://localhost:${PORT}/admin.html`);
  });
});
