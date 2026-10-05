const mysql = require('mysql2/promise');

async function inspectDb() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'class'
  });

  try {
    const [columns] = await pool.query("DESCRIBE `cognitive_load_logs`");
    console.log("cognitive_load_logs Columns:", columns);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

inspectDb();
