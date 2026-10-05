const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'exam-mcq',
  waitForConnections: true,
  connectionLimit: 10,
});

async function initializeDatabase() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS exam_materials (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      teacher_id VARCHAR(64) NOT NULL,
      course_id VARCHAR(64) NOT NULL,
      course_name VARCHAR(255) NOT NULL,
      lesson_name VARCHAR(255) NOT NULL,
      unit_no VARCHAR(50) NOT NULL,
      document_type ENUM('pdf', 'presentation') NOT NULL,
      original_file_name VARCHAR(255) NOT NULL,
      stored_file_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      mime_type VARCHAR(150) NOT NULL,
      file_size BIGINT UNSIGNED NOT NULL,
      extraction_status ENUM('pending', 'completed', 'failed', 'not_applicable') NOT NULL DEFAULT 'pending',
      extraction_error TEXT NULL,
      extracted_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_exam_materials_teacher (teacher_id),
      INDEX idx_exam_materials_teacher_course (teacher_id, course_id),
      INDEX idx_exam_materials_lesson_unit (lesson_name, unit_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Keep existing installations compatible with the extraction pipeline.
  const [columns] = await pool.query('SHOW COLUMNS FROM exam_materials');
  const columnNames = new Set(columns.map((column) => column.Field));
  if (!columnNames.has('course_id')) {
    await pool.execute('ALTER TABLE exam_materials ADD COLUMN course_id VARCHAR(64) NULL AFTER teacher_id');
  }
  if (!columnNames.has('course_name')) {
    await pool.execute('ALTER TABLE exam_materials ADD COLUMN course_name VARCHAR(255) NULL AFTER course_id');
  }
  if (!columnNames.has('extraction_status')) {
    await pool.execute(
      "ALTER TABLE exam_materials ADD COLUMN extraction_status ENUM('pending', 'completed', 'failed', 'not_applicable') NOT NULL DEFAULT 'pending' AFTER file_size"
    );
  }
  if (!columnNames.has('extraction_error')) {
    await pool.execute('ALTER TABLE exam_materials ADD COLUMN extraction_error TEXT NULL AFTER extraction_status');
  }
  if (!columnNames.has('extracted_at')) {
    await pool.execute('ALTER TABLE exam_materials ADD COLUMN extracted_at TIMESTAMP NULL AFTER extraction_error');
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS exam_material_chunks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      material_id BIGINT UNSIGNED NOT NULL,
      chunk_index INT UNSIGNED NOT NULL,
      page_number INT UNSIGNED NOT NULL,
      content TEXT NOT NULL,
      character_count INT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_material_chunk (material_id, chunk_index),
      INDEX idx_chunks_material_page (material_id, page_number),
      CONSTRAINT fk_chunks_material FOREIGN KEY (material_id)
        REFERENCES exam_materials(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS exam_material_images (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      material_id BIGINT UNSIGNED NOT NULL,
      image_index INT UNSIGNED NOT NULL,
      page_number INT UNSIGNED NOT NULL,
      image_data LONGBLOB NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      width INT UNSIGNED NULL,
      height INT UNSIGNED NULL,
      byte_size BIGINT UNSIGNED NOT NULL,
      image_hash CHAR(64) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_material_image (material_id, image_index),
      INDEX idx_images_material_page (material_id, page_number),
      INDEX idx_images_hash (image_hash),
      CONSTRAINT fk_images_material FOREIGN KEY (material_id)
        REFERENCES exam_materials(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS exam_quizzes (
      id CHAR(36) NOT NULL,
      teacher_id VARCHAR(64) NOT NULL,
      lesson_name VARCHAR(255) NOT NULL,
      unit_no VARCHAR(50) NOT NULL,
      model_name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_quizzes_teacher_created (teacher_id, created_at),
      INDEX idx_quizzes_lesson_unit (lesson_name, unit_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS exam_quiz_questions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      quiz_id CHAR(36) NOT NULL,
      question_index TINYINT UNSIGNED NOT NULL,
      question_text TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_option ENUM('A', 'B', 'C', 'D') NOT NULL,
      explanation TEXT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_quiz_question (quiz_id, question_index),
      CONSTRAINT fk_questions_quiz FOREIGN KEY (quiz_id)
        REFERENCES exam_quizzes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { pool, initializeDatabase };
