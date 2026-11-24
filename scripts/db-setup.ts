import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL in the process environment before running db:setup');
  const sql = neon(url);
  const schema = await readFile('db/schema.sql', 'utf8');
  const statements = schema.split(';').map(statement => statement.trim()).filter(Boolean);
  await sql.transaction(statements.map(statement => sql.query(statement)));
  console.log('Database schema is ready.');
}
main().catch(() => { console.error('Database setup failed. Check DATABASE_URL and database access.'); process.exitCode = 1; });
