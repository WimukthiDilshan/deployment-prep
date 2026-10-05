const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const multer = require('multer');

const { pool } = require('../config/database');
const requireTeacher = require('../middleware/auth');
const { uploadDocument, uploadDirectory } = require('../middleware/upload');
const { extractPdf } = require('../services/pdfExtraction');

const router = express.Router();

function runUpload(req, res, next) {
  uploadDocument.single('document')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'The document exceeds the upload size limit.' });
    }
    return res.status(400).json({ message: error.message || 'Invalid document upload.' });
  });
}

router.post('/', requireTeacher, runUpload, async (req, res) => {
  const courseId = String(req.body.courseId || '').trim();
  const courseName = String(req.body.courseName || '').trim();
  const lessonName = String(req.body.lessonName || '').trim();
  const unitNo = String(req.body.unitNo || '').trim();
  if (!courseId || !courseName || !lessonName || !unitNo || !req.file) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ message: 'Course, lesson name, unit number, and document are required.' });
  }

  const extension = path.extname(req.file.originalname).toLowerCase();
  const documentType = extension === '.pdf' ? 'pdf' : 'presentation';

  let extraction = null;
  try {
    if (documentType === 'pdf') {
      extraction = await extractPdf(req.file.path);
      if (!extraction.chunks?.length) {
        const noTextError = new Error(
          'No readable text was found in this PDF, even after OCR. Upload a clearer PDF and try again.'
        );
        noTextError.status = 422;
        throw noTextError;
      }
    }

    const connection = await pool.getConnection();
    let result;
    try {
      await connection.beginTransaction();
      [result] = await connection.execute(
        `INSERT INTO exam_materials
         (teacher_id, course_id, course_name, lesson_name, unit_no, document_type, original_file_name,
          stored_file_name, file_path, mime_type, file_size, extraction_status, extracted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(req.teacher.id), courseId, courseName, lessonName, unitNo, documentType,
          req.file.originalname, req.file.filename,
          path.relative(path.resolve(__dirname, '../..'), req.file.path).replace(/\\/g, '/'),
          req.file.mimetype || 'application/octet-stream', req.file.size,
          extraction ? 'completed' : 'not_applicable', extraction ? new Date() : null,
        ]
      );

      for (const chunk of extraction?.chunks || []) {
        await connection.execute(
          `INSERT INTO exam_material_chunks
           (material_id, chunk_index, page_number, content, character_count)
           VALUES (?, ?, ?, ?, ?)`,
          [result.insertId, chunk.chunkIndex, chunk.pageNumber, chunk.content, chunk.characterCount]
        );
      }

      for (const image of extraction?.images || []) {
        await connection.execute(
          `INSERT INTO exam_material_images
           (material_id, image_index, page_number, image_data, mime_type,
            width, height, byte_size, image_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            result.insertId, image.imageIndex, image.pageNumber, image.data,
            image.mimeType, image.width, image.height, image.byteSize, image.hash,
          ]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return res.status(201).json({
      message: extraction
        ? 'Exam material uploaded and processed successfully.'
        : 'Exam material uploaded successfully.',
      material: {
        id: result.insertId,
        teacherId: String(req.teacher.id),
        courseId,
        courseName,
        lessonName,
        unitNo,
        documentType,
        originalFileName: req.file.originalname,
        fileSize: req.file.size,
        extractionStatus: extraction ? 'completed' : 'not_applicable',
        pageCount: extraction?.pageCount ?? null,
        chunkCount: extraction?.chunks.length ?? 0,
        imageCount: extraction?.images.length ?? 0,
        ocrPageCount: extraction?.ocrPageCount ?? 0,
      },
    });
  } catch (error) {
    await fs.unlink(req.file.path).catch(() => {});
    console.error('Exam material upload failed:', error);
    return res.status(error.status || 500).json({
      message: error.status || error.message.startsWith('PDF extraction failed:')
        ? error.message
        : 'Failed to process and save the exam material.',
    });
  }
});

router.get('/', requireTeacher, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, course_id AS courseId, course_name AS courseName,
              lesson_name AS lessonName, unit_no AS unitNo,
              document_type AS documentType, original_file_name AS originalFileName,
              file_size AS fileSize, extraction_status AS extractionStatus,
              (SELECT COUNT(*) FROM exam_material_chunks c WHERE c.material_id = exam_materials.id) AS chunkCount,
              (SELECT COUNT(*) FROM exam_material_images i WHERE i.material_id = exam_materials.id) AS imageCount,
              created_at AS createdAt
       FROM exam_materials WHERE teacher_id = ? ORDER BY created_at DESC`,
      [String(req.teacher.id)]
    );
    return res.json({ materials: rows });
  } catch (error) {
    console.error('Exam materials list failed:', error);
    return res.status(500).json({ message: 'Failed to load exam materials.' });
  }
});

router.get('/lessons', requireTeacher, async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT course_id AS courseId, course_name AS courseName,
              lesson_name AS lessonName, unit_no AS unitNo, COUNT(*) AS materialCount
       FROM exam_materials
       GROUP BY course_id, course_name, lesson_name, unit_no
       ORDER BY course_name ASC, lesson_name ASC, unit_no ASC`
    );
    return res.json({ lessons: rows });
  } catch (error) {
    console.error('Exam lessons list failed:', error);
    return res.status(500).json({ message: 'Failed to load exam lessons.' });
  }
});

router.get('/:id/content', requireTeacher, async (req, res) => {
  try {
    const [materials] = await pool.execute(
      `SELECT id, lesson_name AS lessonName, unit_no AS unitNo,
              extraction_status AS extractionStatus
       FROM exam_materials WHERE id = ? AND teacher_id = ? LIMIT 1`,
      [req.params.id, String(req.teacher.id)]
    );
    if (!materials.length) return res.status(404).json({ message: 'Exam material not found.' });

    const [chunks] = await pool.execute(
      `SELECT id, chunk_index AS chunkIndex, page_number AS pageNumber,
              content, character_count AS characterCount
       FROM exam_material_chunks WHERE material_id = ? ORDER BY chunk_index`,
      [req.params.id]
    );
    const [images] = await pool.execute(
      `SELECT id, image_index AS imageIndex, page_number AS pageNumber,
              mime_type AS mimeType, width, height, byte_size AS byteSize
       FROM exam_material_images WHERE material_id = ? ORDER BY image_index`,
      [req.params.id]
    );
    return res.json({ material: materials[0], chunks, images });
  } catch (error) {
    console.error('Exam material content load failed:', error);
    return res.status(500).json({ message: 'Failed to load extracted material content.' });
  }
});

router.get('/:id/images/:imageId', requireTeacher, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT i.image_data, i.mime_type
       FROM exam_material_images i
       INNER JOIN exam_materials m ON m.id = i.material_id
       WHERE i.id = ? AND i.material_id = ? AND m.teacher_id = ? LIMIT 1`,
      [req.params.imageId, req.params.id, String(req.teacher.id)]
    );
    if (!rows.length) return res.status(404).json({ message: 'Extracted image not found.' });
    res.set('Content-Type', rows[0].mime_type);
    res.set('Cache-Control', 'private, max-age=3600');
    return res.send(rows[0].image_data);
  } catch (error) {
    console.error('Exam material image load failed:', error);
    return res.status(500).json({ message: 'Failed to load the extracted image.' });
  }
});

router.get('/:id/file', requireTeacher, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT original_file_name, stored_file_name FROM exam_materials
     WHERE id = ? AND teacher_id = ? LIMIT 1`,
    [req.params.id, String(req.teacher.id)]
  );
  if (!rows.length) return res.status(404).json({ message: 'Exam material not found.' });

  const filePath = path.resolve(uploadDirectory, rows[0].stored_file_name);
  if (!filePath.startsWith(`${uploadDirectory}${path.sep}`)) {
    return res.status(400).json({ message: 'Invalid stored file path.' });
  }
  return res.download(filePath, rows[0].original_file_name);
});

module.exports = router;
