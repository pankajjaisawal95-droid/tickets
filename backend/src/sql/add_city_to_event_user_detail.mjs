// One-off migration: add a `city` column to event_user_detail (idempotent).
// Run from the backend folder:  node src/sql/add_city_to_event_user_detail.mjs
import 'dotenv/config';
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || '',
});

try {
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'event_user_detail' AND COLUMN_NAME = 'city'`,
    [process.env.DB_NAME]
  );

  if (cols.length) {
    console.log('✓ city column already exists — nothing to do');
  } else {
    await pool.query(
      `ALTER TABLE event_user_detail
       ADD COLUMN city VARCHAR(120) NULL AFTER name`
    );
    console.log('✓ city column added to event_user_detail');
  }
} catch (err) {
  console.error('✗ migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
