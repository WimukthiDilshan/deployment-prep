const crypto = require('crypto');
const express = require('express');

const { pool } = require('../config/database');
const requireTeacher = require('../middleware/auth');
const { generateMcqs, GeminiMcqError } = require('../services/geminiMcq');

const router = express.Router();
const OPTIONS = ['A', 'B', 'C', 'D'];

function buildContext(rows) {
  const maximumCharacters = Number(process.env.GEMINI_CONTEXT_CHARS || 20000);
  const seen = new Set();
  const sections = [];
  let characterCount = 0;
  for (const row of rows) {
    const content = String(row.content || '').trim();
    const normalized = content.replace(/\s+/g, ' ').toLocaleLowerCase();
    if (!content || seen.has(normalized)) continue;
    seen.add(normalized);
    const section = `[Page ${row.pageNumber}]\n${content}`;
    if (characterCount + section.length > maximumCharacters) {
      const remaining = maximumCharacters - characterCount;
      if (remaining >= 500) sections.push(section.slice(0, remaining));
      break;
    }
    sections.push(section);
    characterCount += section.length + 2;
  }
  return sections.join('\n\n');
}

router.post('/generate', requireTeacher, async (req, res) => {
  const lessonName = String(req.body.lessonName || '').trim();
  const unitNo = String(req.body.unitNo || '').trim();
  const courseId = String(req.body.courseId || '').trim();
  const cognitiveLoad = String(req.body.cognitiveLoad || '').trim() || 'Unknown';
  if (!courseId || !lessonName || !unitNo) {
    return res.status(400).json({ message: 'Course, lesson name, and unit number are required.' });
  }

  try {
    const [chunks] = await pool.execute(
      `SELECT c.content, c.page_number AS pageNumber
       FROM exam_material_chunks c
       INNER JOIN exam_materials m ON m.id = c.material_id
       WHERE m.course_id = ? AND m.lesson_name = ? AND m.unit_no = ?
         AND m.extraction_status = 'completed'
       ORDER BY m.created_at ASC, c.chunk_index ASC`,
      [courseId, lessonName, unitNo]
    );
    const context = buildContext(chunks);
    if (!context) {
      return res.status(422).json({
        message: 'No extracted PDF chunk data is available for this lesson.',
      });
    }

    const generated = await generateMcqs({ lessonName, unitNo, cognitiveLoad, context });
    const quizId = crypto.randomUUID();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO exam_quizzes (id, teacher_id, lesson_name, unit_no, model_name)
         VALUES (?, ?, ?, ?, ?)`,
        [quizId, String(req.teacher.id), lessonName, unitNo, generated.model]
      );
      for (const [index, question] of generated.questions.entries()) {
        await connection.execute(
          `INSERT INTO exam_quiz_questions
           (quiz_id, question_index, question_text, option_a, option_b, option_c,
            option_d, correct_option, explanation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            quizId, index, question.question, ...question.options,
            question.correctAnswer, question.explanation,
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
      quiz: {
        id: quizId,
        lessonName,
        unitNo,
        cognitiveLoad,
        questionCount: generated.questions.length,
        questions: generated.questions.map((question, index) => ({
          index,
          question: question.question,
          options: question.options,
        })),
      },
    });
  } catch (error) {
    console.error('Exam quiz generation failed:', error);
    if (error instanceof GeminiMcqError) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to generate and save the exam.' });
  }
});

router.post('/:id/check', requireTeacher, async (req, res) => {
  const answers = req.body.answers;
  if (!Array.isArray(answers) || answers.length !== 10) {
    return res.status(400).json({ message: 'Answers for all 10 questions are required.' });
  }
  const normalizedAnswers = answers.map((answer) => String(answer || '').trim().toUpperCase());
  if (normalizedAnswers.some((answer) => !OPTIONS.includes(answer))) {
    return res.status(400).json({ message: 'Every answer must be A, B, C, or D.' });
  }

  try {
    const [questions] = await pool.execute(
      `SELECT q.question_index AS questionIndex, q.correct_option AS correctAnswer,
              q.explanation
       FROM exam_quiz_questions q
       INNER JOIN exam_quizzes e ON e.id = q.quiz_id
       WHERE q.quiz_id = ? AND e.teacher_id = ?
       ORDER BY q.question_index ASC`,
      [req.params.id, String(req.teacher.id)]
    );
    if (questions.length !== 10) return res.status(404).json({ message: 'Exam not found.' });

    const results = questions.map((question) => {
      const selectedAnswer = normalizedAnswers[question.questionIndex];
      return {
        questionIndex: question.questionIndex,
        selectedAnswer,
        correctAnswer: question.correctAnswer,
        correct: selectedAnswer === question.correctAnswer,
        explanation: question.explanation,
      };
    });
    return res.json({
      score: results.filter((result) => result.correct).length,
      total: results.length,
      results,
    });
  } catch (error) {
    console.error('Exam answer check failed:', error);
    return res.status(500).json({ message: 'Failed to check exam answers.' });
  }
});

router.get('/:id/answers', requireTeacher, async (req, res) => {
  try {
    const [questions] = await pool.execute(
      `SELECT q.question_index AS questionIndex, q.correct_option AS correctAnswer,
              q.explanation
       FROM exam_quiz_questions q
       INNER JOIN exam_quizzes e ON e.id = q.quiz_id
       WHERE q.quiz_id = ? AND e.teacher_id = ?
       ORDER BY q.question_index ASC`,
      [req.params.id, String(req.teacher.id)]
    );
    if (questions.length !== 10) return res.status(404).json({ message: 'Exam not found.' });

    return res.json({
      results: questions.map((question) => ({
        questionIndex: question.questionIndex,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
      })),
    });
  } catch (error) {
    console.error('Exam answer sheet load failed:', error);
    return res.status(500).json({ message: 'Failed to load the exam answer sheet.' });
  }
});

module.exports = router;
