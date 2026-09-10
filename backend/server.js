const express = require("express");
const multer = require("multer");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 5050;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;

if (!ADMIN_PASSWORD) {
  throw new Error("ADMIN_PASSWORD wurde nicht gesetzt.");
}

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL wurde nicht gesetzt.");
}

// --------------------------------------------------
// PostgreSQL
// --------------------------------------------------

const pool = new Pool({
  connectionString: DATABASE_URL
});

pool.on("error", (error) => {
  console.error("Unerwarteter PostgreSQL-Fehler:", error);
});

// --------------------------------------------------
// Pfade
// --------------------------------------------------

const BACKEND_ROOT = __dirname;

const FRONTEND_ROOT = path.join(
  BACKEND_ROOT,
  "public"
);

const STORAGE_ROOT = path.resolve(
  process.env.STORAGE_DIR ||
    process.env.RAILWAY_VOLUME_MOUNT_PATH ||
    BACKEND_ROOT
);

const FLYER_DIR = path.join(
  STORAGE_ROOT,
  "uploads",
  "flyers"
);

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(express.json());

app.use(
  express.static(FRONTEND_ROOT)
);

app.use(
  "/flyers",
  express.static(FLYER_DIR)
);

// --------------------------------------------------
// Datenbank initialisieren
// --------------------------------------------------

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS flyers (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      valid_until DATE,
      original_name TEXT NOT NULL,
      filename TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_flyers_uploaded_at
    ON flyers(uploaded_at DESC);
  `);

  console.log(
    "PostgreSQL-Datenbank initialisiert."
  );
}

// --------------------------------------------------
// Datei-Speicher initialisieren
// --------------------------------------------------

async function ensureStorage() {
  await fs.mkdir(FLYER_DIR, {
    recursive: true
  });
}

// --------------------------------------------------
// Admin Middleware
// --------------------------------------------------

function requireAdmin(
  req,
  res,
  next
) {
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

// --------------------------------------------------
// Multer / PDF Upload
// --------------------------------------------------

const storage = multer.diskStorage({
  destination: (
    _req,
    _file,
    cb
  ) => {
    cb(null, FLYER_DIR);
  },

  filename: (
    _req,
    file,
    cb
  ) => {
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

  fileFilter: (
    _req,
    file,
    cb
  ) => {
    const isPdf =
      file.mimetype ===
        "application/pdf" ||
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

// --------------------------------------------------
// GET /api/flyers
// --------------------------------------------------

app.get(
  "/api/flyers",
  async (_req, res, next) => {
    try {
      const result =
        await pool.query(`
          SELECT
            id,
            title,
            description,
            valid_until AS "validUntil",
            original_name AS "originalName",
            filename,
            url,
            uploaded_at AS "uploadedAt"
          FROM flyers
          ORDER BY uploaded_at DESC;
        `);

      return res.json(
        result.rows
      );
    } catch (error) {
      next(error);
    }
  }
);

// --------------------------------------------------
// POST /api/admin/login
// --------------------------------------------------

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

// --------------------------------------------------
// POST /api/flyers
// --------------------------------------------------

app.post(
  "/api/flyers",
  requireAdmin,
  upload.single("flyer"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({
            message:
              "Bitte eine PDF-Datei auswählen."
          });
      }

      const id =
        crypto.randomUUID();

      const title =
        (
          req.body.title || ""
        ).trim() ||
        "Aktueller Wochenflyer";

      const description =
        (
          req.body.description ||
          ""
        ).trim();

      const validUntil =
        req.body.validUntil ||
        null;

      const originalName =
        req.file.originalname;

      const filename =
        req.file.filename;

      const url =
        `/flyers/${filename}`;

      try {
        const result =
          await pool.query(
            `
              INSERT INTO flyers (
                id,
                title,
                description,
                valid_until,
                original_name,
                filename,
                url
              )
              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7
              )
              RETURNING
                id,
                title,
                description,
                valid_until AS "validUntil",
                original_name AS "originalName",
                filename,
                url,
                uploaded_at AS "uploadedAt";
            `,
            [
              id,
              title,
              description,
              validUntil,
              originalName,
              filename,
              url
            ]
          );

        return res
          .status(201)
          .json(
            result.rows[0]
          );
      } catch (databaseError) {
        // Falls der DB-Eintrag fehlschlägt,
        // hochgeladene Datei wieder löschen
        await fs.rm(
          req.file.path,
          {
            force: true
          }
        );

        throw databaseError;
      }
    } catch (error) {
      next(error);
    }
  }
);

// --------------------------------------------------
// DELETE /api/flyers/:id
// --------------------------------------------------

app.delete(
  "/api/flyers/:id",
  requireAdmin,
  async (req, res, next) => {
    try {
      const result =
        await pool.query(
          `
            DELETE FROM flyers
            WHERE id = $1
            RETURNING
              id,
              filename;
          `,
          [req.params.id]
        );

      if (
        result.rowCount === 0
      ) {
        return res
          .status(404)
          .json({
            message:
              "Flyer wurde nicht gefunden."
          });
      }

      const flyer =
        result.rows[0];

      await fs.rm(
        path.join(
          FLYER_DIR,
          flyer.filename
        ),
        {
          force: true
        }
      );

      return res.json({
        ok: true
      });
    } catch (error) {
      next(error);
    }
  }
);

// --------------------------------------------------
// Error Handler
// --------------------------------------------------

app.use(
  (
    error,
    _req,
    res,
    _next
  ) => {
    console.error(error);

    let status =
      error.status || 500;

    if (
      error instanceof
      multer.MulterError
    ) {
      status = 400;
    }

    // Ungültige UUID
    if (
      error.code === "22P02"
    ) {
      status = 400;
    }

    return res
      .status(status)
      .json({
        message:
          error.message ||
          "Ein Serverfehler ist aufgetreten."
      });
  }
);

// --------------------------------------------------
// Server starten
// --------------------------------------------------

async function startServer() {
  try {
    await ensureStorage();

    await pool.query(
      "SELECT NOW();"
    );

    console.log(
      "PostgreSQL-Verbindung erfolgreich."
    );

    await initDatabase();

    app.listen(
      PORT,
      () => {
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
          `Flyer-Speicher: ${FLYER_DIR}`
        );
      }
    );
  } catch (error) {
    console.error(
      "Server konnte nicht gestartet werden:",
      error
    );

    process.exit(1);
  }
}

startServer();