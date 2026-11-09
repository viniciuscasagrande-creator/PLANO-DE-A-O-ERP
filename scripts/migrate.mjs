import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(rootDir, ".env") });

async function main() {
  const migrationsDir = path.join(rootDir, "db", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql"))
    .sort();

  if (process.env.USE_EXTERNAL_PG === "true" && process.env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          filename text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        );
      `);
      const { rows } = await client.query("SELECT filename FROM schema_migrations");
      const applied = new Set(rows.map(r => r.filename));
      for (const file of files) {
        if (applied.has(file)) {
          console.log(`[migrate] Já aplicada: ${file}`);
          continue;
        }
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`[migrate] Aplicada com sucesso (PostgreSQL): ${file}`);
      }
    } finally {
      client.release();
      await pool.end();
    }
    return;
  }

  // Embedded PostgreSQL 16 via PGlite
  const pgDataDir = process.env.PGLITE_DATA_DIR || path.join(rootDir, "data", "pgdata");
  if (!fs.existsSync(pgDataDir)) {
    fs.mkdirSync(pgDataDir, { recursive: true });
  }
  const db = new PGlite(pgDataDir);
  await db.waitReady;

  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const { rows } = await db.query("SELECT filename FROM schema_migrations");
  const applied = new Set(rows.map(r => r.filename));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[migrate] Já aplicada: ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await db.transaction(async tx => {
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
    });
    console.log(`[migrate] Aplicada com sucesso (PGlite PostgreSQL 16): ${file}`);
  }

  await db.close();
}

main().catch(err => {
  console.error("[migrate] Erro:", err);
  process.exit(1);
});
