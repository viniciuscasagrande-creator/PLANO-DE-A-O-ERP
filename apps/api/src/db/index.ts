import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..", "..", "..");
dotenv.config({ path: path.join(rootDir, ".env") });

export interface QueryResult<T = any> {
  rows: T[];
  rowCount?: number | null;
}

export interface DbClient {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
}

let pgliteInstance: PGlite | null = null;
let pgPool: pg.Pool | null = null;

export async function getDb(customDataDir?: string): Promise<DbClient> {
  if (process.env.USE_EXTERNAL_PG === "true" && process.env.DATABASE_URL) {
    if (!pgPool) {
      pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    }
    return {
      query: (sql: string, params?: any[]) => pgPool!.query(sql, params),
      exec: async (sql: string) => {
        await pgPool!.query(sql);
      }
    };
  }

  if (!pgliteInstance) {
    const pgDataDir = customDataDir || process.env.PGLITE_DATA_DIR || path.join(rootDir, "data", "pgdata");
    if (pgDataDir !== "memory://" && !fs.existsSync(pgDataDir)) {
      fs.mkdirSync(pgDataDir, { recursive: true });
    }
    pgliteInstance = new PGlite(pgDataDir === "memory://" ? undefined : pgDataDir);
    await pgliteInstance.waitReady;
  }

  return {
    query: async <T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> => {
      const res = await pgliteInstance!.query<T>(sql, params);
      return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
    },
    exec: async (sql: string) => {
      await pgliteInstance!.exec(sql);
    }
  };
}

export async function withTransaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
  const db = await getDb();
  if (pgliteInstance) {
    return pgliteInstance.transaction(async tx => {
      const wrapped: DbClient = {
        query: async <R = any>(sql: string, params?: any[]): Promise<QueryResult<R>> => {
          const res = await tx.query<R>(sql, params);
          return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
        },
        exec: async (sql: string) => {
          await tx.exec(sql);
        }
      };
      return fn(wrapped);
    });
  }

  // External pg.Pool transaction
  const client = await pgPool!.connect();
  try {
    await client.query("BEGIN");
    const wrapped: DbClient = {
      query: (sql: string, params?: any[]) => client.query(sql, params),
      exec: async (sql: string) => {
        await client.query(sql);
      }
    };
    const result = await fn(wrapped);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function runMigrations(): Promise<string[]> {
  const db = await getDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const migrationsDir = path.join(rootDir, "db", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql"))
    .sort();

  const appliedRes = await db.query<{ filename: string }>("SELECT filename FROM schema_migrations");
  const appliedSet = new Set(appliedRes.rows.map(r => r.filename));
  const newlyApplied: string[] = [];

  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await withTransaction(async tx => {
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
    });
    newlyApplied.push(file);
  }

  return newlyApplied;
}

export async function recordAudit(params: {
  pessoa_id?: number | null;
  acao: string;
  entidade: string;
  entidade_id?: string | number | null;
  antes?: any;
  depois?: any;
  ip?: string | null;
  tx?: DbClient;
}) {
  const client = params.tx || (await getDb());
  // LGPD Rule #6: Strip sensitive banking/password fields from audit logs
  const sanitize = (obj: any) => {
    if (!obj || typeof obj !== "object") return obj ?? null;
    const copy = { ...obj };
    for (const k of ["senha", "senha_hash", "conta", "agencia", "chave_pix", "documento"]) {
      if (k in copy && copy[k]) copy[k] = "***LGPD_MASKED***";
    }
    return copy;
  };

  await client.query(
    `INSERT INTO auditoria (pessoa_id, acao, entidade, entidade_id, antes, depois, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      params.pessoa_id ?? null,
      params.acao,
      params.entidade,
      params.entidade_id != null ? String(params.entidade_id) : null,
      params.antes ? JSON.stringify(sanitize(params.antes)) : null,
      params.depois ? JSON.stringify(sanitize(params.depois)) : null,
      params.ip ?? "127.0.0.1"
    ]
  );
}
