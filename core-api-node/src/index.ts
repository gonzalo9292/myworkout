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

type RoutineRow = {
  id: number;
  name: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date | null;
};

type RoutineItemRow = {
  id: number;
  routine_id: number;
  exercise_id: number;
  position: number;
  sets: number | null;
  reps: string | null;
  rest_seconds: number | null;
  notes: string | null;
};

// ===============================
// ROUTINES (MVP)
// ===============================

// GET /routines -> lista de rutinas
app.get("/routines", async (_req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `
      SELECT id, name, notes, created_at, updated_at
      FROM routines
      ORDER BY created_at DESC
      `
    );
    res.json(rows);
  } catch (e) {
    console.error("[ROUTINES] Error en GET /routines:", e);
    res.status(500).json({ message: "Error listando rutinas" });
  }
});

// POST /routines -> crear rutina { name, notes? }
app.post("/routines", async (req, res) => {
  const { name, notes } = req.body ?? {};
  const cleanName = String(name ?? "").trim();

  if (!cleanName) {
    return res.status(400).json({ message: "name es obligatorio" });
  }

  try {
    const [result] = await pool.query<ResultSetHeader>(
      `
      INSERT INTO routines (name, notes)
      VALUES (?, ?)
      `,
      [cleanName, notes ?? null]
    );

    res.status(201).json({
      id: result.insertId,
      name: cleanName,
      notes: notes ?? null,
    });
  } catch (e) {
    console.error("[ROUTINES] Error en POST /routines:", e);
    res.status(500).json({ message: "Error creando rutina" });
  }
});

// GET /routines/:id -> detalle (incluye items + info del ejercicio)
app.get("/routines/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "ID inválido" });

  try {
    const [rRows] = await pool.query<RowDataPacket[]>(
      `
      SELECT id, name, notes, created_at, updated_at
      FROM routines
      WHERE id = ?
      `,
      [id]
    );

    if (rRows.length === 0) {
      return res.status(404).json({ message: "Rutina no encontrada" });
    }

    const routine = rRows[0];

    const [items] = await pool.query<RowDataPacket[]>(
      `
      SELECT
      ri.id,
      ri.routine_id,
      ri.exercise_id,
      ri.position,
      ri.sets,
      ri.reps,
      ri.notes,
      e.name AS exercise_name,
      e.image_url AS exercise_image_url
    FROM routine_items ri
    JOIN exercises e ON e.id = ri.exercise_id
    WHERE ri.routine_id = ?
    ORDER BY ri.position ASC, ri.id ASC

      `,
      [id]
    );

    res.json({
      ...routine,
      items,
    });
  } catch (e) {
    console.error("[ROUTINES] Error en GET /routines/:id:", e);
    res.status(500).json({ message: "Error cargando rutina" });
  }
});

// PUT /routines/:id -> editar { name?, notes? }
app.put("/routines/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "ID inválido" });

  const { name, notes } = req.body ?? {};
  const cleanName = name != null ? String(name).trim() : null;

  try {
    // comprobar existe
    const [rRows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM routines WHERE id = ?`,
      [id]
    );
    if (rRows.length === 0) {
      return res.status(404).json({ message: "Rutina no encontrada" });
    }

    // update parcial
    await pool.query(
      `
      UPDATE routines
      SET
        name = COALESCE(?, name),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [cleanName, notes ?? null, id]
    );

    res.json({ message: "Rutina actualizada" });
  } catch (e) {
    console.error("[ROUTINES] Error en PUT /routines/:id:", e);
    res.status(500).json({ message: "Error actualizando rutina" });
  }
});

// DELETE /routines/:id -> borrar rutina (cascade borra items)
app.delete("/routines/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "ID inválido" });

  try {
    const [result] = await pool.query<ResultSetHeader>(
      `DELETE FROM routines WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Rutina no encontrada" });
    }

    res.json({ message: "Rutina eliminada" });
  } catch (e) {
    console.error("[ROUTINES] Error en DELETE /routines/:id:", e);
    res.status(500).json({ message: "Error eliminando rutina" });
  }
});

// POST /routines/:id/items -> añadir ejercicio a la rutina
// body: { exerciseId, position?, sets?, reps?, restSeconds?, notes? }
// POST /routines/:id/items -> añadir ejercicio a la rutina
// body: { exerciseId, position?, sets?, reps?, notes? }
app.post("/routines/:id/items", async (req, res) => {
  const routineId = Number(req.params.id);
  if (!routineId) return res.status(400).json({ message: "ID inválido" });

  const { exerciseId, position, sets, reps, notes } = req.body ?? {};

  const exId = Number(exerciseId);
  if (!exId) {
    return res.status(400).json({ message: "exerciseId es obligatorio" });
  }

  // sets opcional
  const cleanSets =
    sets === null || sets === undefined || sets === "" ? null : Number(sets);

  if (cleanSets !== null && (!Number.isFinite(cleanSets) || cleanSets < 1)) {
    return res.status(400).json({ message: "sets debe ser un número >= 1" });
  }

  // reps opcional (texto libre)
  const cleanReps =
    reps === null || reps === undefined || reps === "" ? null : String(reps);

  const cleanNotes =
    notes === null || notes === undefined || notes === ""
      ? null
      : String(notes);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // comprobar rutina
    const [rRows] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM routines WHERE id = ?`,
      [routineId]
    );
    if (rRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Rutina no encontrada" });
    }

    // comprobar ejercicio existe
    const [eRows] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM exercises WHERE id = ?`,
      [exId]
    );
    if (eRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Ejercicio no encontrado" });
    }

    // position por defecto: al final
    let pos = Number(position);
    if (!pos || pos < 1) {
      const [maxRows] = await conn.query<RowDataPacket[]>(
        `
        SELECT COALESCE(MAX(position), 0) AS maxPos
        FROM routine_items
        WHERE routine_id = ?
        `,
        [routineId]
      );
      pos = Number(maxRows[0].maxPos) + 1;
    }

    const [result] = await conn.query<ResultSetHeader>(
      `
      INSERT INTO routine_items
        (routine_id, exercise_id, position, sets, reps, notes)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [routineId, exId, pos, cleanSets, cleanReps, cleanNotes]
    );

    await conn.commit();

    res.status(201).json({
      id: result.insertId,
      routine_id: routineId,
      exercise_id: exId,
      position: pos,
      sets: cleanSets,
      reps: cleanReps,
      notes: cleanNotes,
    });
  } catch (e) {
    await conn.rollback();
    console.error("[ROUTINES] Error en POST /routines/:id/items:", e);
    res.status(500).json({ message: "Error añadiendo ejercicio a rutina" });
  } finally {
    conn.release();
  }
});

// DELETE /routines/:id/items/:itemId -> quitar item
app.delete("/routines/:id/items/:itemId", async (req, res) => {
  const routineId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (!routineId || !itemId) {
    return res.status(400).json({ message: "ID inválido" });
  }

  try {
    const [result] = await pool.query<ResultSetHeader>(
      `
      DELETE FROM routine_items
      WHERE id = ? AND routine_id = ?
      `,
      [itemId, routineId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Item no encontrado" });
    }

    res.json({ message: "Ejercicio eliminado de la rutina" });
  } catch (e) {
    console.error("[ROUTINES] Error en DELETE /routines/:id/items/:itemId:", e);
    res.status(500).json({ message: "Error eliminando item" });
  }
});

type WorkoutRow = {
  id: number;
  workout_date: string; // DATE en MySQL viene como string o Date según config
  notes: string | null;
  created_at: Date;
};

type WorkoutItemRow = {
  id: number;
  workout_id: number;
  exercise_id: number;
  position: number;
  notes: string | null;
};

type WorkoutSetRow = {
  id: number;
  workout_item_id: number;
  set_index: number;
  reps: number | null;
  weight_kg: number | null;
};

// ===============================
// WORKOUTS (Entrenamientos) - MVP
// ===============================

// ===============================
// WORKOUTS (Entrenamientos) - MVP
// Opción A: al crear desde rutina, copiamos SOLO workout_items
// (NO creamos filas en workout_sets; los sets los añade el usuario)
// ===============================

// GET /workouts?date=YYYY-MM-DD  -> entreno por fecha
app.get("/workouts", async (req, res) => {
  const date = String(req.query.date ?? "").trim();

  if (!date) {
    // lista simple (últimos 30)
    try {
      const [rows] = await pool.query<RowDataPacket[]>(
        `
        SELECT id, workout_date, notes, created_at
        FROM workouts
        ORDER BY workout_date DESC
        LIMIT 30
        `
      );
      return res.json(rows);
    } catch (e) {
      console.error("[WORKOUTS] Error listando workouts:", e);
      return res.status(500).json({ message: "Error listando entrenamientos" });
    }
  }

  // validar formato básico YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ message: "date debe ser YYYY-MM-DD" });
  }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `
      SELECT id, workout_date, notes, created_at
      FROM workouts
      WHERE workout_date = ?
      LIMIT 1
      `,
      [date]
    );

    if (rows.length === 0) return res.json(null);
    return res.json(rows[0]);
  } catch (e) {
    console.error("[WORKOUTS] Error en GET /workouts?date=:", e);
    return res.status(500).json({ message: "Error consultando entrenamiento" });
  }
});

// POST /workouts  body: { date: YYYY-MM-DD, notes?: string, routineId?: number }
app.post("/workouts", async (req, res) => {
  const { date, notes, routineId } = req.body ?? {};
  const cleanDate = String(date ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    return res
      .status(400)
      .json({ message: "date es obligatorio (YYYY-MM-DD)" });
  }

  const rId =
    routineId === null || routineId === undefined || routineId === ""
      ? null
      : Number(routineId);

  if (rId !== null && (!Number.isFinite(rId) || rId < 1)) {
    return res.status(400).json({ message: "routineId inválido" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) crear workout
    const [result] = await conn.query<ResultSetHeader>(
      `
      INSERT INTO workouts (workout_date, notes)
      VALUES (?, ?)
      `,
      [cleanDate, notes ?? null]
    );

    const workoutId = Number(result.insertId);

    // 2) si viene rutina, copiamos SOLO workout_items (NO sets)
    if (rId) {
      // comprobar rutina existe
      const [rRows] = await conn.query<RowDataPacket[]>(
        `SELECT id, name FROM routines WHERE id = ?`,
        [rId]
      );
      if (rRows.length === 0) {
        await conn.rollback();
        return res.status(404).json({ message: "Rutina no encontrada" });
      }

      const routineName = String((rRows[0] as any)?.name ?? "").trim();

      const [ritems] = await conn.query<RowDataPacket[]>(
        `
        SELECT exercise_id, position, notes, sets, reps
        FROM routine_items
        WHERE routine_id = ?
        ORDER BY position ASC, id ASC
        `,
        [rId]
      );

      for (const it of ritems as any[]) {
        const exId = Number(it.exercise_id);
        const pos = Number(it.position) || 1;

        // Nota útil: arrastramos notas y además dejamos “plan” de la rutina
        const baseNotes = (it.notes ?? null) as string | null;

        const plannedSets =
          it.sets === null || it.sets === undefined || it.sets === ""
            ? null
            : Number(it.sets);

        const plannedReps =
          it.reps === null || it.reps === undefined || it.reps === ""
            ? null
            : String(it.reps);

        const planBits: string[] = [];
        if (plannedSets && Number.isFinite(plannedSets) && plannedSets > 0) {
          planBits.push(`${plannedSets} series`);
        }
        if (plannedReps) {
          planBits.push(`reps: ${plannedReps}`);
        }

        const plan = planBits.length ? `Plan: ${planBits.join(" · ")}` : null;

        const mergedNotes =
          baseNotes && plan ? `${baseNotes} · ${plan}` : baseNotes || plan;

        await conn.query<ResultSetHeader>(
          `
          INSERT INTO workout_items (workout_id, exercise_id, position, notes)
          VALUES (?, ?, ?, ?)
          `,
          [workoutId, exId, pos, mergedNotes ?? null]
        );
      }

      // Opcional: añadir una nota general al workout indicando la rutina usada
      // (sin machacar notes existentes)
      if (routineName) {
        const extra = `Rutina: ${routineName}`;
        await conn.query(
          `
          UPDATE workouts
          SET notes = TRIM(CONCAT(
            COALESCE(notes,''),
            CASE WHEN notes IS NULL OR notes='' THEN '' ELSE ' · ' END,
            ?
          ))
          WHERE id = ?
          `,
          [extra, workoutId]
        );
      }
    }

    await conn.commit();

    return res.status(201).json({
      id: workoutId,
      workout_date: cleanDate,
      notes: notes ?? null,
      routine_id: rId, // informativo
    });
  } catch (e: any) {
    await conn.rollback();

    if (String(e?.code) === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "Ya existe un entrenamiento para esa fecha" });
    }

    console.error("[WORKOUTS] Error en POST /workouts:", e);
    return res.status(500).json({ message: "Error creando entrenamiento" });
  } finally {
    conn.release();
  }
});

// GET /workouts/:id  -> detalle completo
app.get("/workouts/:id", async (req, res) => {
  const workoutId = Number(req.params.id);
  if (!workoutId) return res.status(400).json({ message: "ID inválido" });

  try {
    const [wRows] = await pool.query<RowDataPacket[]>(
      `
      SELECT id, workout_date, notes, created_at
      FROM workouts
      WHERE id = ?
      `,
      [workoutId]
    );
    if (wRows.length === 0)
      return res.status(404).json({ message: "Entrenamiento no encontrado" });

    const workout = wRows[0];

    const [items] = await pool.query<RowDataPacket[]>(
      `
      SELECT
        wi.id,
        wi.workout_id,
        wi.exercise_id,
        wi.position,
        wi.notes,
        e.name AS exercise_name,
        e.image_url AS exercise_image_url
      FROM workout_items wi
      JOIN exercises e ON e.id = wi.exercise_id
      WHERE wi.workout_id = ?
      ORDER BY wi.position ASC, wi.id ASC
      `,
      [workoutId]
    );

    // sets (puede que no haya ninguno si se creó desde rutina con opción A)
    const itemIds = items.map((it: any) => it.id);
    let setsByItem: Record<number, any[]> = {};

    if (itemIds.length > 0) {
      const [setRows] = await pool.query<RowDataPacket[]>(
        `
        SELECT id, workout_item_id, set_index, reps, weight_kg
        FROM workout_sets
        WHERE workout_item_id IN (${itemIds.map(() => "?").join(",")})
        ORDER BY workout_item_id ASC, set_index ASC, id ASC
        `,
        itemIds
      );

      for (const s of setRows as any[]) {
        const k = Number(s.workout_item_id);
        setsByItem[k] = setsByItem[k] ?? [];
        setsByItem[k].push(s);
      }
    }

    const enriched = items.map((it: any) => ({
      ...it,
      sets: setsByItem[Number(it.id)] ?? [],
    }));

    return res.json({
      ...workout,
      items: enriched,
    });
  } catch (e) {
    console.error("[WORKOUTS] Error en GET /workouts/:id:", e);
    return res.status(500).json({ message: "Error cargando entrenamiento" });
  }
});

// POST /workouts/:id/items  body: { exerciseId, position?, notes? }
app.post("/workouts/:id/items", async (req, res) => {
  const workoutId = Number(req.params.id);
  if (!workoutId) return res.status(400).json({ message: "ID inválido" });

  const { exerciseId, position, notes } = req.body ?? {};
  const exId = Number(exerciseId);
  if (!exId)
    return res.status(400).json({ message: "exerciseId es obligatorio" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [wRows] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM workouts WHERE id = ?`,
      [workoutId]
    );
    if (wRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Entrenamiento no encontrado" });
    }

    const [eRows] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM exercises WHERE id = ?`,
      [exId]
    );
    if (eRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Ejercicio no encontrado" });
    }

    let pos = Number(position);
    if (!pos || pos < 1) {
      const [maxRows] = await conn.query<RowDataPacket[]>(
        `SELECT COALESCE(MAX(position), 0) AS maxPos FROM workout_items WHERE workout_id = ?`,
        [workoutId]
      );
      pos = Number((maxRows[0] as any).maxPos) + 1;
    }

    const [result] = await conn.query<ResultSetHeader>(
      `
      INSERT INTO workout_items (workout_id, exercise_id, position, notes)
      VALUES (?, ?, ?, ?)
      `,
      [workoutId, exId, pos, notes ?? null]
    );

    await conn.commit();
    return res.status(201).json({
      id: result.insertId,
      workout_id: workoutId,
      exercise_id: exId,
      position: pos,
      notes: notes ?? null,
    });
  } catch (e) {
    await conn.rollback();
    console.error("[WORKOUTS] Error en POST /workouts/:id/items:", e);
    return res
      .status(500)
      .json({ message: "Error añadiendo ejercicio al entreno" });
  } finally {
    conn.release();
  }
});

// DELETE /workouts/:id/items/:itemId
app.delete("/workouts/:id/items/:itemId", async (req, res) => {
  const workoutId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (!workoutId || !itemId)
    return res.status(400).json({ message: "ID inválido" });

  try {
    const [result] = await pool.query<ResultSetHeader>(
      `DELETE FROM workout_items WHERE id = ? AND workout_id = ?`,
      [itemId, workoutId]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Item no encontrado" });
    return res.json({ message: "Ejercicio eliminado del entreno" });
  } catch (e) {
    console.error("[WORKOUTS] Error en DELETE item:", e);
    return res.status(500).json({ message: "Error eliminando item" });
  }
});

// POST /workouts/:id/items/:itemId/sets  body: { setIndex, reps?, weightKg? }
app.post("/workouts/:id/items/:itemId/sets", async (req, res) => {
  const workoutId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (!workoutId || !itemId)
    return res.status(400).json({ message: "ID inválido" });

  const { setIndex, reps, weightKg } = req.body ?? {};
  const idx = Number(setIndex);

  if (!idx || idx < 1) {
    return res.status(400).json({ message: "setIndex es obligatorio (>= 1)" });
  }

  const repsVal = reps != null ? Number(reps) : null;
  if (repsVal != null && (!Number.isFinite(repsVal) || repsVal < 0)) {
    return res.status(400).json({ message: "reps inválido" });
  }

  const wVal = weightKg != null ? Number(weightKg) : null;
  if (wVal != null && (!Number.isFinite(wVal) || wVal < 0)) {
    return res.status(400).json({ message: "weightKg inválido" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [itRows] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM workout_items WHERE id = ? AND workout_id = ?`,
      [itemId, workoutId]
    );
    if (itRows.length === 0) {
      await conn.rollback();
      return res
        .status(404)
        .json({ message: "Item no encontrado en este entrenamiento" });
    }

    const [result] = await conn.query<ResultSetHeader>(
      `
      INSERT INTO workout_sets (workout_item_id, set_index, reps, weight_kg)
      VALUES (?, ?, ?, ?)
      `,
      [itemId, idx, repsVal, wVal]
    );

    await conn.commit();
    return res.status(201).json({
      id: result.insertId,
      workout_item_id: itemId,
      set_index: idx,
      reps: repsVal,
      weight_kg: wVal,
    });
  } catch (e) {
    await conn.rollback();
    console.error("[WORKOUTS] Error en POST sets:", e);
    return res.status(500).json({ message: "Error añadiendo serie" });
  } finally {
    conn.release();
  }
});

// DELETE /workouts/:id/items/:itemId/sets/:setId
app.delete("/workouts/:id/items/:itemId/sets/:setId", async (req, res) => {
  const workoutId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const setId = Number(req.params.setId);
  if (!workoutId || !itemId || !setId)
    return res.status(400).json({ message: "ID inválido" });

  try {
    const [result] = await pool.query<ResultSetHeader>(
      `
      DELETE ws
      FROM workout_sets ws
      JOIN workout_items wi ON wi.id = ws.workout_item_id
      WHERE ws.id = ? AND ws.workout_item_id = ? AND wi.workout_id = ?
      `,
      [setId, itemId, workoutId]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Serie no encontrada" });
    return res.json({ message: "Serie eliminada" });
  } catch (e) {
    console.error("[WORKOUTS] Error en DELETE set:", e);
    return res.status(500).json({ message: "Error eliminando serie" });
  }
});

// DELETE /workouts/:id -> borrar entrenamiento completo (cascade borra items + sets)
app.delete("/workouts/:id", async (req, res) => {
  const workoutId = Number(req.params.id);
  if (!workoutId) return res.status(400).json({ message: "ID inválido" });

  try {
    const [result] = await pool.query<ResultSetHeader>(
      `DELETE FROM workouts WHERE id = ?`,
      [workoutId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Entrenamiento no encontrado" });
    }

    return res.json({ message: "Entrenamiento eliminado" });
  } catch (e) {
    console.error("[WORKOUTS] Error en DELETE /workouts/:id:", e);
    return res.status(500).json({ message: "Error eliminando entrenamiento" });
  }
});

// ===============================
// ANALYTICS (solo lectura)
// ===============================
// GET /analytics/workouts?from=YYYY-MM-DD&to=YYYY-MM-DD
// Devuelve filas "planas" de workouts + items + sets para agregación en el microservicio
app.get("/analytics/workouts", async (req, res) => {
  const from = String(req.query.from ?? "").trim();
  const to = String(req.query.to ?? "").trim();

  // validación básica
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({
      message: "from y to son obligatorios con formato YYYY-MM-DD",
      example: "/analytics/workouts?from=2026-01-01&to=2026-01-31",
    });
  }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `
      SELECT
        w.id           AS workout_id,
        w.workout_date AS workout_date,
        wi.id          AS workout_item_id,
        wi.exercise_id AS exercise_id,
        e.name         AS exercise_name,
        ws.id          AS set_id,
        ws.set_index   AS set_index,
        ws.reps        AS reps,
        ws.weight_kg   AS weight_kg
      FROM workouts w
      JOIN workout_items wi ON wi.workout_id = w.id
      JOIN exercises e ON e.id = wi.exercise_id
      LEFT JOIN workout_sets ws ON ws.workout_item_id = wi.id
      WHERE w.workout_date BETWEEN ? AND ?
      ORDER BY
        w.workout_date ASC,
        wi.position ASC,
        ws.set_index ASC,
        ws.id ASC
      `,
      [from, to]
    );

    return res.json({
      from,
      to,
      count: rows.length,
      rows,
    });
  } catch (e) {
    console.error("[ANALYTICS] Error en GET /analytics/workouts:", e);
    return res.status(500).json({
      message: "Error obteniendo datos de analytics",
      error: String(e),
    });
  }
});

// ===============================
app.listen(PORT, () => {
  console.log(`Core API escuchando en http://localhost:${PORT}`);
});
