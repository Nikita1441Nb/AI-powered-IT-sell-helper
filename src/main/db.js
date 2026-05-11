import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// База данных будет лежать в папке с проектом (в билде — рядом с .exe)
const db = new Database(join(__dirname, '../../database.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    full_name TEXT,
    address TEXT,
    office TEXT,
    phone TEXT,
    whatsapp TEXT,
    email TEXT,
    website TEXT,
    instagram TEXT,
    telegram TEXT,
    vk TEXT,
    categories TEXT,
    rating TEXT,
    reviews_count TEXT,
    schedule TEXT,
    description TEXT,
    lat TEXT,
    lng TEXT,
    status TEXT DEFAULT 'pending',
    type_json TEXT DEFAULT '[]', 
    last_sent DATETIME
  );

  CREATE TABLE IF NOT EXISTS wa_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT UNIQUE,
    phone TEXT,
    name TEXT,
    last_message TEXT,
    last_time INTEGER,
    status TEXT DEFAULT 'active',
    type_json TEXT DEFAULT '[]',
    ai_time_tag TEXT
  );
`);

try {
  const tableInfo = db.prepare("PRAGMA table_info(wa_contacts)").all();
  const columnExists = tableInfo.some(col => col.name === 'ai_time_tag');
  
  if (!columnExists) {
    db.exec("ALTER TABLE wa_contacts ADD COLUMN ai_time_tag TEXT;");
    console.log('[Migration] Column ai_time_tag added to wa_contacts');
  }
} catch (err) {
  console.error('[Migration Error] ', err.message);
}

export default db;