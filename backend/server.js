const express = require("express");
const multer = require("multer");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 5050;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  throw new Error("ADMIN_PASSWORD wurde nicht gesetzt.");
}

// -----------------------------
// Pfade
// -----------------------------

const BACKEND_ROOT = __dirname;

const FRONTEND_ROOT = path.join(BACKEND_ROOT, "public");

const STORAGE_ROOT = path.resolve(
  process.env.STORAGE_DIR ||
    process.env.RAILWAY_VOLUME_MOUNT_PATH ||
    BACKEND_ROOT
);

const DATA_FILE = path.join(
  STORAGE_ROOT,
  "data",
  "flyers.json"
);

const FLYER_DIR = path.join(
  STORAGE_ROOT,
  "uploads",
  "flyers"
);

// Daten aus dem Git-Repository,
// falls ein Railway Volume zum ersten Mal leer ist
const SEED_DATA_FILE = path.join(
  BACKEND_ROOT,
  "data",
  "flyers.json"
);

const SEED_FLYER_DIR = path.join(
  BACKEND_ROOT,
  "uploads",
  "flyers"
);

// -----------------------------
// Middleware
// -----------------------------

app.use(express.json());

// Frontend aus /public bereitstellen
app.use(express.static(FRONTEND_ROOT));

// Hochgeladene Flyer bereitstellen
app.use("/flyers", express.static(FLYER_DIR));

// -----------------------------
// Hilfsfunktionen
// -----------------------------

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function seedStorageFromRepo() {
  // Lokal brauchen wir nichts kopieren
  if (STORAGE_ROOT === BACKEND_ROOT) {
    return;
  }

  // flyers.json in Railway Volume kopieren,
  // falls dort noch keine Datei existiert
  if (
    !(await pathExists(DATA_FILE)) &&
    (await pathExists(SEED_DATA_FILE))
  ) {
    await fs.copyFile(
      SEED_DATA_FILE,
      DATA_FILE
    );
  }

  // Prüfen, ob schon Flyer im Volume existieren
  const existingFiles = await fs.readdir(FLYER_DIR);

  if (
    existingFiles.some(
      (file) => file !== ".gitkeep"
    )
  ) {
    return;
  }

  if (!(await pathExists(SEED_FLYER_DIR))) {
    return;
  }

  const seedFiles = await fs.readdir(
    SEED_FLYER_DIR,
    {
      withFileTypes: true
    }
  );

  await Promise.all(
    seedFiles
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name !== ".gitkeep"
      )
      .map((entry) =>
        fs.copyFile(
          path.join(
            SEED_FLYER_DIR,
            entry.name
          ),
          path.join(
            FLYER_DIR,
            entry.name
          )
        )
      )
  );
}

async function ensureStorage() {
  // data-Ordner erstellen
  await fs.mkdir(
    path.dirname(DATA_FILE),
    {
      recursive: true
    }
  );

  // uploads/flyers erstellen
  await fs.mkdir(FLYER_DIR, {
    recursive: true
  });

  await seedStorageFromRepo();

  // Falls noch keine JSON-Datei vorhanden ist
  if (!(await pathExists(DATA_FILE))) {
    await fs.writeFile(
      DATA_FILE,
      "[]\n",
      "utf8"
    );
  }
}

async function readFlyers() {
  await ensureStorage();

  const raw = await fs.readFile(
    DATA_FILE,
    "utf8"
  );

  return JSON.parse(raw || "[]");
}

async function writeFlyers(flyers) {
  await fs.writeFile(
    DATA_FILE,
    `${JSON.stringify(flyers, null, 2)}\n`,
    "utf8"
  );
}

// -----------------------------
// Admin Middleware
// -----------------------------

function requireAdmin(req, res, next) {
  if (
    req.get("x-admin-password") ===
    ADMIN_PASSWORD
  ) {
    return next();
  }

  return res.status(401).json({
    message:
      "Admin-Passwort fehlt oder ist falsch."
  });
}

// -----------------------------
// Multer / PDF Upload
// -----------------------------

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, FLYER_DIR);
  },

  filename: (_req, file, cb) => {
    const ext =
      path
        .extname(file.originalname)
        .toLowerCase() || ".pdf";

    cb(
      null,
      `${Date.now()}-${crypto.randomUUID()}${ext}`
    );
  }
});

const upload = multer({
  storage,

  limits: {
    fileSize: 20 * 1024 * 1024
  },

  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === "application/pdf" ||
      path
        .extname(file.originalname)
        .toLowerCase() === ".pdf";

    if (!isPdf) {
      const error = new Error(
        "Nur PDF-Dateien sind erlaubt."
      );

      error.status = 400;

      return cb(error);
    }

    cb(null, true);
  }
});

// -----------------------------
// GET Flyer
// -----------------------------

app.get(
  "/api/flyers",
  async (_req, res, next) => {
    try {
      const flyers = await readFlyers();

      flyers.sort(
        (a, b) =>
          new Date(b.uploadedAt).getTime() -
          new Date(a.uploadedAt).getTime()
      );

      return res.json(flyers);
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------
// Admin Login
// -----------------------------

app.post(
  "/api/admin/login",
  (req, res) => {
    if (
      req.body?.password ===
      ADMIN_PASSWORD
    ) {
      return res.json({
        ok: true
      });
    }

    return res.status(401).json({
      message:
        "Das Passwort ist falsch."
    });
  }
);

// -----------------------------
// Flyer hochladen
// -----------------------------

app.post(
  "/api/flyers",
  requireAdmin,
  upload.single("flyer"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message:
            "Bitte eine PDF-Datei auswählen."
        });
      }

      const flyers =
        await readFlyers();

      const uploadedAt =
        new Date().toISOString();

      const title =
        (req.body.title || "").trim() ||
        "Aktueller Wochenflyer";

      const flyer = {
        id: crypto.randomUUID(),

        title,

        description:
          (
            req.body.description || ""
          ).trim(),

        validUntil:
          req.body.validUntil || "",

        originalName:
          req.file.originalname,

        filename:
          req.file.filename,

        url: `/flyers/${req.file.filename}`,

        uploadedAt
      };

      flyers.unshift(flyer);

      await writeFlyers(flyers);

      return res
        .status(201)
        .json(flyer);
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------
// Flyer löschen
// -----------------------------

app.delete(
  "/api/flyers/:id",
  requireAdmin,
  async (req, res, next) => {
    try {
      const flyers =
        await readFlyers();

      const flyer = flyers.find(
        (item) =>
          item.id === req.params.id
      );

      if (!flyer) {
        return res.status(404).json({
          message:
            "Flyer wurde nicht gefunden."
        });
      }

      await fs.rm(
        path.join(
          FLYER_DIR,
          flyer.filename
        ),
        {
          force: true
        }
      );

      const remainingFlyers =
        flyers.filter(
          (item) =>
            item.id !== req.params.id
        );

      await writeFlyers(
        remainingFlyers
      );

      return res.json({
        ok: true
      });
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------
// Error Handler
// -----------------------------

app.use(
  (error, _req, res, _next) => {
    console.error(error);

    let status =
      error.status || 500;

    if (
      error instanceof
      multer.MulterError
    ) {
      status = 400;
    }

    return res.status(status).json({
      message:
        error.message ||
        "Ein Serverfehler ist aufgetreten."
    });
  }
);

// -----------------------------
// Server starten
// -----------------------------

async function startServer() {
  try {
    await ensureStorage();

    app.listen(PORT, () => {
      console.log(
        `Server läuft auf Port ${PORT}`
      );

      console.log(
        `Frontend: http://localhost:${PORT}`
      );

      console.log(
        `Admin: http://localhost:${PORT}/admin.html`
      );

      console.log(
        `Speicherpfad: ${STORAGE_ROOT}`
      );
    });
  } catch (error) {
    console.error(
      "Server konnte nicht gestartet werden:",
      error
    );

    process.exit(1);
  }
}

startServer();