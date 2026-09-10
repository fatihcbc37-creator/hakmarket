const express = require("express");
const multer = require("multer");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 5050;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const BACKEND_ROOT = __dirname;
const PROJECT_ROOT = path.resolve(BACKEND_ROOT, "..");
const FRONTEND_ROOT = path.join(PROJECT_ROOT, "frontend");
const STORAGE_ROOT = path.resolve(process.env.STORAGE_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || BACKEND_ROOT);
const DATA_FILE = path.join(STORAGE_ROOT, "data", "flyers.json");
const FLYER_DIR = path.join(STORAGE_ROOT, "uploads", "flyers");
const SEED_DATA_FILE = path.join(BACKEND_ROOT, "data", "flyers.json");
const SEED_FLYER_DIR = path.join(BACKEND_ROOT, "uploads", "flyers");

app.use(express.json());
app.use(express.static(FRONTEND_ROOT));
app.use("/flyers", express.static(FLYER_DIR));

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function seedStorageFromRepo() {
  if (STORAGE_ROOT === BACKEND_ROOT) {
    return;
  }

  if (!(await pathExists(DATA_FILE)) && (await pathExists(SEED_DATA_FILE))) {
    await fs.copyFile(SEED_DATA_FILE, DATA_FILE);
  }

  const existingFiles = await fs.readdir(FLYER_DIR);
  if (existingFiles.some((file) => file !== ".gitkeep")) {
    return;
  }

  if (!(await pathExists(SEED_FLYER_DIR))) {
    return;
  }

  const seedFiles = await fs.readdir(SEED_FLYER_DIR, { withFileTypes: true });
  await Promise.all(
    seedFiles
      .filter((entry) => entry.isFile() && entry.name !== ".gitkeep")
      .map((entry) => fs.copyFile(path.join(SEED_FLYER_DIR, entry.name), path.join(FLYER_DIR, entry.name)))
  );
}

async function ensureStorage() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.mkdir(FLYER_DIR, { recursive: true });
  await seedStorageFromRepo();

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
    console.log(`Speicherpfad: ${STORAGE_ROOT}`);
  });
});
