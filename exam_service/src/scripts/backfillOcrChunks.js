require('dotenv').config();

const path = require('path');

const { pool } = require('../config/database');
const { uploadDirectory } = require('../middleware/upload');
const { extractPdf } = require('../services/pdfExtraction');

const dryRun = process.argv.includes('--dry-run');
const materialIdsArgument = process.argv.find((argument) => argument.startsWith('--material-ids='));
const selectedMaterialIds = new Set(
  String(materialIdsArgument?.split('=', 2)[1] || '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)
);

function resolveUploadedFile(storedFileName) {
  const filePath = path.resolve(uploadDirectory, path.basename(storedFileName));
  if (!filePath.startsWith(`${uploadDirectory}${path.sep}`)) {
    throw new Error('Invalid stored PDF path.');
  }
  return filePath;
}

async function findMaterialsWithoutChunks() {
  const [rows] = await pool.execute(
    `SELECT m.id, m.original_file_name AS originalFileName,
            m.stored_file_name AS storedFileName
     FROM exam_materials m
     LEFT JOIN exam_material_chunks c ON c.material_id = m.id
     WHERE m.document_type = 'pdf'
     GROUP BY m.id, m.original_file_name, m.stored_file_name
     HAVING COUNT(c.id) = 0
     ORDER BY m.id`
  );
  return rows;
}

async function saveChunks(materialId, chunks) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[countRow]] = await connection.execute(
      'SELECT COUNT(*) AS chunkCount FROM exam_material_chunks WHERE material_id = ?',
      [materialId]
    );
    if (Number(countRow.chunkCount) > 0) {
      await connection.rollback();
      return false;
    }

    for (const chunk of chunks) {
      await connection.execute(
        `INSERT INTO exam_material_chunks
         (material_id, chunk_index, page_number, content, character_count)
         VALUES (?, ?, ?, ?, ?)`,
        [materialId, chunk.chunkIndex, chunk.pageNumber, chunk.content, chunk.characterCount]
      );
    }
    await connection.execute(
      `UPDATE exam_materials
       SET extraction_status = 'completed', extraction_error = NULL, extracted_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [materialId]
    );
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  const allMaterials = await findMaterialsWithoutChunks();
  const materials = selectedMaterialIds.size
    ? allMaterials.filter((material) => selectedMaterialIds.has(Number(material.id)))
    : allMaterials;
  console.log(`Found ${materials.length} PDF material(s) without chunks.`);
  if (dryRun) {
    for (const material of materials) {
      console.log(`[dry-run] ${material.id}: ${material.originalFileName}`);
    }
    return;
  }

  for (const material of materials) {
    const extraction = await extractPdf(resolveUploadedFile(material.storedFileName));
    if (!extraction.chunks?.length) {
      console.warn(`Skipped ${material.id}: OCR found no readable text.`);
      continue;
    }
    const saved = await saveChunks(material.id, extraction.chunks);
    console.log(
      `${saved ? 'Saved' : 'Skipped'} ${material.id}: ${extraction.chunks.length} chunks `
      + `(${extraction.ocrPageCount || 0} OCR pages).`
    );
  }
}

main()
  .catch((error) => {
    console.error('OCR chunk backfill failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
