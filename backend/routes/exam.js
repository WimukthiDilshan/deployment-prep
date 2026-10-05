const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const verifyToken = require('../middleware/verifyToken');
const Enrollment = require('../models/Enrollment');

const router = express.Router();
const examServiceUrl = (process.env.EXAM_SERVICE_URL || 'http://localhost:8120').replace(/\/$/, '');
const apiGatewayUrl = (process.env.API_GATEWAY_URL || 'http://localhost:4000').replace(/\/$/, '');
const limeServiceUrl = (process.env.LIME_AI_SERVICE_URL || 'http://localhost:8110').replace(/\/$/, '');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function teacherHeaders(req) {
  return { 'x-teacher-id': String(req.user.id) };
}

function upstreamError(res, error) {
  if (error.response) return res.status(error.response.status).json(error.response.data);
  console.error('Exam service request failed:', error.message);
  return res.status(502).json({ message: 'Exam service is unavailable.' });
}

async function resolveOwnedCourse(req, courseId) {
  const response = await axios.get(
    `${apiGatewayUrl}/api/courses/${encodeURIComponent(courseId)}/for-edit`,
    { headers: { Authorization: req.headers.authorization } }
  );
  return response.data?.data;
}

router.get('/materials', verifyToken, async (req, res) => {
  try {
    const upstream = await axios.get(`${examServiceUrl}/materials`, { headers: teacherHeaders(req) });
    return res.status(upstream.status).json(upstream.data);
  } catch (error) {
    return upstreamError(res, error);
  }
});

router.get('/materials/lessons', verifyToken, async (req, res) => {
  try {
    const upstream = await axios.get(`${examServiceUrl}/materials/lessons`, {
      headers: teacherHeaders(req),
    });
    if (req.user?.role !== 'Student') {
      return res.status(upstream.status).json(upstream.data);
    }

    const enrollments = await Enrollment.find({ studentId: req.user.id })
      .select('courseId')
      .lean();
    const enrolledCourseIds = new Set(enrollments.map((row) => String(row.courseId)));
    const lessons = Array.isArray(upstream.data?.lessons)
      ? upstream.data.lessons.filter((lesson) => enrolledCourseIds.has(String(lesson.courseId)))
      : [];
    return res.status(upstream.status).json({ ...upstream.data, lessons });
  } catch (error) {
    return upstreamError(res, error);
  }
});

router.post('/materials', verifyToken, (req, res, next) => {
  upload.single('document')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'The document exceeds the 25 MB limit.' });
    }
    return res.status(400).json({ message: error.message || 'Invalid document upload.' });
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Choose a document to upload.' });

  const courseId = String(req.body.courseId || '').trim();
  if (!courseId) return res.status(400).json({ message: 'Select one of your courses.' });

  let course;
  try {
    course = await resolveOwnedCourse(req, courseId);
  } catch (error) {
    if (error.response?.status === 400 || error.response?.status === 404) {
      return res.status(400).json({ message: 'The selected course does not exist.' });
    }
    if (error.response?.status === 401 || error.response?.status === 403) {
      return res.status(403).json({ message: 'You can only upload exam materials to your own courses.' });
    }
    return upstreamError(res, error);
  }

  if (!course?.id || !course?.courseName) {
    return res.status(502).json({ message: 'Could not verify the selected course.' });
  }

  const form = new FormData();
  form.append('courseId', String(course.id));
  form.append('courseName', String(course.courseName));
  form.append('lessonName', req.body.lessonName || '');
  form.append('unitNo', req.body.unitNo || '');
  form.append('document', req.file.buffer, {
    filename: req.file.originalname,
    contentType: req.file.mimetype,
  });

  try {
    const upstream = await axios.post(`${examServiceUrl}/materials`, form, {
      headers: { ...form.getHeaders(), ...teacherHeaders(req) },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return res.status(upstream.status).json(upstream.data);
  } catch (error) {
    return upstreamError(res, error);
  }
});

router.get('/materials/:id/file', verifyToken, async (req, res) => {
  try {
    const upstream = await axios.get(`${examServiceUrl}/materials/${req.params.id}/file`, {
      headers: teacherHeaders(req),
      responseType: 'arraybuffer',
    });
    if (upstream.headers['content-type']) res.set('Content-Type', upstream.headers['content-type']);
    if (upstream.headers['content-disposition']) res.set('Content-Disposition', upstream.headers['content-disposition']);
    return res.status(upstream.status).send(upstream.data);
  } catch (error) {
    return upstreamError(res, error);
  }
});

router.get('/materials/:id/content', verifyToken, async (req, res) => {
  try {
    const upstream = await axios.get(`${examServiceUrl}/materials/${req.params.id}/content`, {
      headers: teacherHeaders(req),
    });
    return res.status(upstream.status).json(upstream.data);
  } catch (error) {
    return upstreamError(res, error);
  }
});

router.get('/materials/:id/images/:imageId', verifyToken, async (req, res) => {
  try {
    const upstream = await axios.get(
      `${examServiceUrl}/materials/${req.params.id}/images/${req.params.imageId}`,
      { headers: teacherHeaders(req), responseType: 'arraybuffer' }
    );
    if (upstream.headers['content-type']) res.set('Content-Type', upstream.headers['content-type']);
    if (upstream.headers['cache-control']) res.set('Cache-Control', upstream.headers['cache-control']);
    return res.status(upstream.status).send(upstream.data);
  } catch (error) {
    return upstreamError(res, error);
  }
});

router.post('/quizzes/generate', verifyToken, async (req, res) => {
  try {
    const requestBody = { ...req.body };
    if (req.user?.role === 'Student') {
      const courseId = String(requestBody.courseId || '').trim();
      const enrollment = await Enrollment.findOne({ studentId: req.user.id, courseId }).lean();
      if (!enrollment) {
        return res.status(403).json({ message: 'You can only generate exams for enrolled courses.' });
      }

      const loadResponse = await axios.get(
        `${limeServiceUrl}/api/v1/lessons/${encodeURIComponent(courseId)}` +
          `/students/${encodeURIComponent(String(req.user.id))}/cognitive-load-counts`,
        { timeout: 10000 }
      );
      const loadData = loadResponse.data?.data || {};
      requestBody.cognitiveLoad = loadData.dominant_cognitive_load || 'Unknown';
      requestBody.cognitiveLoadCounts = loadData.counts || {};
    }

    const upstream = await axios.post(`${examServiceUrl}/quizzes/generate`, requestBody, {
      headers: teacherHeaders(req),
      timeout: Number(process.env.EXAM_GENERATION_TIMEOUT_MS || 620000),
    });
    return res.status(upstream.status).json({
      ...upstream.data,
      cognitiveLoadCounts: requestBody.cognitiveLoadCounts || {},
    });
  } catch (error) {
    return upstreamError(res, error);
  }
});

router.post('/quizzes/:id/check', verifyToken, async (req, res) => {
  try {
    const upstream = await axios.post(
      `${examServiceUrl}/quizzes/${req.params.id}/check`,
      req.body,
      { headers: teacherHeaders(req) }
    );
    return res.status(upstream.status).json(upstream.data);
  } catch (error) {
    return upstreamError(res, error);
  }
});

router.get('/quizzes/:id/answers', verifyToken, async (req, res) => {
  try {
    const upstream = await axios.get(
      `${examServiceUrl}/quizzes/${req.params.id}/answers`,
      { headers: teacherHeaders(req) }
    );
    return res.status(upstream.status).json(upstream.data);
  } catch (error) {
    return upstreamError(res, error);
  }
});

module.exports = router;
