// src/index.ts
import express from "express";
import mysql, { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import axios from "axios";

const app = express();
const PORT = 3000;

app.use(express.json());

// ===============================
// MySQL pool
// ===============================
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST ?? "localhost",
  user: process.env.MYSQL_USER ?? "root",
  password: process.env.MYSQL_PASSWORD ?? "root",
  port: Number(process.env.MYSQL_PORT ?? 3307),
  database: process.env.MYSQL_DATABASE ?? "myworkout",
  waitForConnections: true,
  connectionLimit: 10,
});

// ===============================
// JWT
// ===============================
const JWT_SECRET = "supersecret-token-myworkout";

// ===============================
// Sync policy
// ===============================
/**
 * Si true: SOLO guardamos ejercicios que tengan traducción en español
 * (o que vengan directamente con name/description en ES).
 *
 * Esto elimina casi todo el inglés y también reduce muchísimo el volumen.
 */
const ONLY_SPANISH = true;

/**
 * Si true: SOLO guardamos ejercicios que tengan URL de imagen válida.
 * Esto evita que se inserten ejercicios con image_url = NULL.
 */
const ONLY_WITH_IMAGE = true;

/**
 * Límite duro de ejercicios insertados/actualizados en una sincronización,
 * por si quieres empezar con un catálogo “manejable”.
 * 0 = sin límite.
 */
const MAX_EXERCISES_TO_PROCESS = 300;

/**
 * ID de idioma en WGER para español (en tu caso te funciona con 4).
 * Lo usamos en:
 *  - la URL de exerciseinfo (language=...)
 *  - el selector de traducciones (pickBestText)
 */
const WGER_LANG_ES = 4;

// ===============================
// Types
// ===============================
interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  created_at: Date;
}

type WgerPagedResponse<T> = {
  count?: number;
  next: string | null;
  previous?: string | null;
  results: T[];
};

type WgerMuscle = {
  id: number;
  name?: string;
  name_en?: string;

  // otros campos que puede devolver WGER (no los usamos, pero existen)
  is_front?: boolean;
  image_url_main?: string;
  image_url_secondary?: string;
};

/**
 * IMPORTANTE:
 * En /exerciseinfo, WGER puede devolver muscles y muscles_secondary como:
 *  - array de números [1,2,3]
 *  - o array de objetos [{id:1, name:...}, ...]
 *
 * Por eso los tipamos como (number | {id:number}) y luego normalizamos.
 */
type WgerExerciseInfo = {
  id: number;

  // a veces vienen, a veces no (depende de endpoint/parámetros)
  name?: string;
  description?: string;

  muscles?: Array<number | { id: number }>;
  muscles_secondary?: Array<number | { id: number }>;

  images?: { image: string }[];

  translations?: Array<{
    language?: number; // suele ser id numérico
    name?: string;
    description?: string;
  }>;
};

// ===============================
// Utils
// ===============================
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function muscleName(m: WgerMuscle): string {
  return (m.name || m.name_en || `Muscle ${m.id}`).trim();
}

/**
 * Selecciona el mejor texto posible, priorizando ES.
 */
function pickBestText(ex: WgerExerciseInfo) {
  const LANG_ES = WGER_LANG_ES;

  const directName = (ex.name ?? "").trim();
  const directDesc = (ex.description ?? "").trim();

  // Si WGER ya nos lo da “directo”, lo aceptamos como “best”
  if (directName) {
    return {
      hasSpanish: true, // asumimos que si pedimos language=ES, esto viene en ES
      name: directName,
      descHtml: directDesc,
    };
  }

  const translations = ex.translations ?? [];
  const trEs = translations.find(
    (t) => t.language === LANG_ES && (t.name ?? "").trim()
  );
  const trAny = translations.find((t) => (t.name ?? "").trim());

  const best = trEs ?? trAny ?? null;

  const name = (best?.name ?? "").trim();
  const descHtml = (best?.description ?? "").trim();

  return {
    hasSpanish: Boolean(trEs && (trEs.name ?? "").trim()),
    name: name || "",
    descHtml,
  };
}

/**
 * Heurística mínima para “limpiar” entradas basura.
 * (Si quieres, luego la refinamos con reglas más estrictas.)
 */
function isGarbageName(name: string): boolean {
  const n = name.trim();
  if (n.length < 3) return true;

  const lowered = n.toLowerCase();
  if (lowered === "test" || lowered === "asdf" || lowered === "exercise") {
    return true;
  }
  return false;
}

/**
 * Normaliza muscles/muscles_secondary para quedarnos SOLO con IDs numéricos.
 * Soporta:
 *  - [1,2,3]
 *  - [{id:1,...},{id:2,...}]
 */
function normalizeMuscleIds(arr?: Array<number | { id: number }>): number[] {
  if (!arr || !Array.isArray(arr)) return [];

  const ids: number[] = [];
  for (const item of arr) {
    if (typeof item === "number" && Number.isFinite(item)) {
      ids.push(item);
      continue;
    }

    if (item && typeof item === "object") {
      const id = (item as any).id;
      if (typeof id === "number" && Number.isFinite(id)) {
        ids.push(id);
      }
    }
  }

  return ids;
}

/**
 * Devuelve la primera URL de imagen válida (si existe) o null.
 */
function pickFirstImageUrl(ex: WgerExerciseInfo): string | null {
  const first = ex.images && ex.images.length > 0 ? ex.images[0]?.image : null;
  const url = typeof first === "string" ? first.trim() : "";
  return url ? url : null;
}

/**
 * Paginación WGER sin genéricos de axios ni destructuring.
 * Esto evita TS7022 en configuraciones estrictas.
 */
async function fetchWgerPaged<T>(startUrl: string): Promise<T[]> {
  let nextUrl: string | null = startUrl;
  const all: T[] = [];

  while (nextUrl) {
    const resp: any = await axios.get(nextUrl);
    const page = resp.data as WgerPagedResponse<T>;

    const results = (page?.results ?? []) as T[];
    all.push(...results);

    nextUrl = (page?.next ?? null) as string | null;
  }

  return all;
}

// ===============================
// Health
// ===============================
app.get("/health", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ status: "ok", db: rows });
  } catch (error) {
    console.error("[Core API] Error conectando a MySQL:", error);
    res.status(500).json({ status: "error", message: "DB connection failed" });
  }
});

// ===============================
// Auth
// ===============================
app.post("/auth/register", async (req, res) => {
  const { email, password, name, role } = req.body;

  if (!email || !password || !name) {
    return res
      .status(400)
      .json({ message: "email, password y name son obligatorios" });
  }

  const userRole = role === "ADMIN" ? "ADMIN" : "USER";

  try {
    const [existing] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: "El email ya está registrado" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await pool.query<ResultSetHeader>(
      "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)",
      [email, passwordHash, name, userRole]
    );

    return res.status(201).json({
      id: result.insertId,
      email,
      name,
      role: userRole,
    });
  } catch (error) {
    console.error("[Core API] Error en /auth/register:", error);
    return res.status(500).json({ message: "Error al registrar usuario" });
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "email y password son obligatorios" });
  }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    const users = rows as unknown as UserRow[];
    if (users.length === 0) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const user = users[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("[Core API] Error en /auth/login:", error);
    return res.status(500).json({ message: "Error al iniciar sesión" });
  }
});

app.get("/auth/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  const token = authHeader.substring("Bearer ".length);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: number;
      email: string;
      role: string;
      iat: number;
      exp: number;
    };

    return res.json({
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    });
  } catch (error) {
    console.error("[Core API] Error verificando token:", error);
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
});

// ===============================
// (Opcional) Reset catálogo
// ===============================
app.post("/exercises/reset", async (_req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // borra relaciones primero
    await conn.query("DELETE FROM exercise_muscles");
    // luego ejercicios (muscles los mantenemos)
    await conn.query("DELETE FROM exercises");

    await conn.commit();
    return res.json({
      message: "Catálogo de ejercicios reiniciado (exercises + rels)",
    });
  } catch (e) {
    await conn.rollback();
    console.error("[RESET] ERROR:", e);
    return res
      .status(500)
      .json({ message: "Error reseteando catálogo", error: String(e) });
  } finally {
    conn.release();
  }
});

// ===============================
// Sync WGER: músculos + ejercicios + relación N:M
// ===============================
app.post("/exercises/sync", async (_req, res) => {
  console.log("======================================");
  console.log("[SYNC] Inicio...");

  const musclesUrl = "https://wger.de/api/v2/muscle/?limit=200";
  const exerciseInfoUrl = `https://wger.de/api/v2/exerciseinfo/?language=${WGER_LANG_ES}&limit=200`;

  let inserted = 0;
  let updated = 0;
  let relationsInserted = 0;

  let skippedNoSpanish = 0;
  let skippedNoImage = 0;
  let skippedGarbage = 0;
  let skippedDuplicates = 0;

  const seenNames = new Set<string>();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // --- MUSCLES ---
    const muscles = await fetchWgerPaged<WgerMuscle>(musclesUrl);
    console.log(`[SYNC] Wger muscles: ${muscles.length}`);

    for (const m of muscles) {
      await conn.query(
        `
        INSERT INTO muscles (wger_id, name)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name)
        `,
        [m.id, muscleName(m)]
      );
    }

    // --- EXERCISES ---
    const exercises = await fetchWgerPaged<WgerExerciseInfo>(exerciseInfoUrl);
    console.log(`[SYNC] Wger exerciseinfo: ${exercises.length}`);

    let processed = 0;

    for (const ex of exercises) {
      // límite de procesado
      if (
        MAX_EXERCISES_TO_PROCESS > 0 &&
        processed >= MAX_EXERCISES_TO_PROCESS
      ) {
        break;
      }

      const wgerId = ex.id;

      // Elegimos texto (prioriza ES)
      const best = pickBestText(ex);

      // Filtro idioma: solo ES si ONLY_SPANISH=true
      if (ONLY_SPANISH && !best.hasSpanish) {
        skippedNoSpanish++;
        continue;
      }

      const name = (best.name || "").trim();
      if (!name || isGarbageName(name)) {
        skippedGarbage++;
        continue;
      }

      // Deduplicación simple por nombre (case-insensitive)
      const key = name.toLowerCase();
      if (seenNames.has(key)) {
        skippedDuplicates++;
        continue;
      }
      seenNames.add(key);

      const descriptionHtml = (best.descHtml || "").trim();
      const descriptionText = descriptionHtml
        ? stripHtml(descriptionHtml)
        : null;

      // ===============================
      // FILTRO POR IMAGEN (SOLUCIÓN)
      // ===============================
      const imageUrl = pickFirstImageUrl(ex);

      // Si exigimos imagen, descartamos si no hay URL válida
      if (ONLY_WITH_IMAGE && !imageUrl) {
        skippedNoImage++;
        continue;
      }

      // existe?
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM exercises WHERE wger_id = ?",
        [wgerId]
      );

      let exerciseId: number;

      if (rows.length === 0) {
        const [ins] = await conn.query<ResultSetHeader>(
          `
          INSERT INTO exercises (wger_id, name, description_html, description_text, image_url)
          VALUES (?, ?, ?, ?, ?)
          `,
          [wgerId, name, descriptionHtml || null, descriptionText, imageUrl]
        );
        exerciseId = Number(ins.insertId);
        inserted++;
      } else {
        exerciseId = Number(rows[0].id);
        await conn.query(
          `
          UPDATE exercises
          SET name = ?, description_html = ?, description_text = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
          `,
          [name, descriptionHtml || null, descriptionText, imageUrl, exerciseId]
        );
        updated++;
      }

      // ===============================
      // Relaciones primarios + secundarios
      // ===============================
      const primaryIds = normalizeMuscleIds(ex.muscles);
      const secondaryIds = normalizeMuscleIds(ex.muscles_secondary);

      const allMuscleIds = Array.from(
        new Set([...primaryIds, ...secondaryIds])
      );

      for (const wgerMuscleId of allMuscleIds) {
        const [mRows] = await conn.query<RowDataPacket[]>(
          "SELECT id FROM muscles WHERE wger_id = ?",
          [wgerMuscleId]
        );
        if (mRows.length === 0) continue;

        const internalMuscleId = Number(mRows[0].id);

        const [relIns] = await conn.query<ResultSetHeader>(
          `
          INSERT IGNORE INTO exercise_muscles (exercise_id, muscle_id)
          VALUES (?, ?)
          `,
          [exerciseId, internalMuscleId]
        );

        if (relIns.affectedRows === 1) relationsInserted++;
      }

      processed++;
    }

    await conn.commit();

    console.log(
      `[SYNC] OK -> inserted=${inserted}, updated=${updated}, relationsInserted=${relationsInserted}`
    );
    console.log(
      `[SYNC] Skipped -> noSpanish=${skippedNoSpanish}, noImage=${skippedNoImage}, garbage=${skippedGarbage}, dupName=${skippedDuplicates}`
    );

    return res.json({
      message: "Sincronización completada",
      onlySpanish: ONLY_SPANISH,
      onlyWithImage: ONLY_WITH_IMAGE,
      maxExercisesToProcess: MAX_EXERCISES_TO_PROCESS,
      wgerLangEs: WGER_LANG_ES,
      inserted,
      updated,
      relationsInserted,
      skipped: {
        noSpanish: skippedNoSpanish,
        noImage: skippedNoImage,
        garbage: skippedGarbage,
        duplicateName: skippedDuplicates,
      },
      note: "Si ves image_url NULL es porque ya estaban en la BD. Usa POST /exercises/reset y luego /exercises/sync (y en Docker, levanta con --build).",
    });
  } catch (error) {
    await conn.rollback();
    console.error("[SYNC] ERROR:", error);
    return res.status(500).json({
      message: "Error sincronizando ejercicios",
      error: String(error),
    });
  } finally {
    conn.release();
  }
});

// ===============================
// Lectura para Angular
// ===============================
app.get("/exercises", async (_req, res) => {
  // IMPORTANTE: para asegurar que Angular no reciba NULL, filtramos también aquí
  // (por si quedó algún registro viejo antes del reset).
  const [rows] = await pool.query<RowDataPacket[]>(
    `
    SELECT id, wger_id, name, description_text, image_url
    FROM exercises
    WHERE image_url IS NOT NULL AND image_url <> ''
    ORDER BY name
    LIMIT 200
    `
  );
  res.json(rows);
});

app.get("/exercises/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "ID inválido" });

  const [exRows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM exercises WHERE id = ?",
    [id]
  );
  if (exRows.length === 0) {
    return res.status(404).json({ message: "No encontrado" });
  }

  const [muscleRows] = await pool.query<RowDataPacket[]>(
    `
    SELECT m.id, m.name, m.wger_id
    FROM exercise_muscles em
    JOIN muscles m ON m.id = em.muscle_id
    WHERE em.exercise_id = ?
    ORDER BY m.name
    `,
    [id]
  );

  res.json({
    ...exRows[0],
    muscles: muscleRows,
  });
});

// ===============================
app.listen(PORT, () => {
  console.log(`Core API escuchando en http://localhost:${PORT}`);
});
