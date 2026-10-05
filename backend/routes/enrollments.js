const express = require('express');
const axios = require('axios');
const Enrollment = require('../models/Enrollment');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

const resourceBaseUrl = (
  process.env.RESOURCE_UPLOAD_URL || 'http://localhost:5000'
).replace(/\/$/, '');
const configuredGatewaySecret = process.env.GATEWAY_SHARED_SECRET;

const requireStudent = (req, res, next) => {
  if (req.user?.role !== 'Student') {
    return res.status(403).json({ message: 'Student access only.' });
  }
  next();
};

const handleServerError = (res, err) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
};

async function assertCourseEnrollmentOpen(courseId, requestGatewaySecret) {
  // Prefer this service's own configuration, but allow the API Gateway to
  // provide the shared secret for deployments where only edge-facing and
  // resource services store it.
  const gatewaySecret = configuredGatewaySecret || requestGatewaySecret;
  if (!gatewaySecret) {
    const err = new Error('Server misconfiguration: missing GATEWAY_SHARED_SECRET');
    err.status = 500;
    throw err;
  }
  try {
    const res = await axios.get(
      `${resourceBaseUrl}/public/courses/${encodeURIComponent(courseId)}`,
      {
        headers: { 'x-gateway-secret': gatewaySecret },
        timeout: 8000,
      }
    );
    const data = res.data?.data;
    const preparing = Number(data?.preparingLessonCount || 0);
    const ready = Number(data?.readyLessonCount || 0);
    const open =
      typeof data?.enrollmentOpen === 'boolean'
        ? data.enrollmentOpen
        : ready > 0 && preparing === 0;
    if (!open) {
      const err = new Error(
        preparing > 0
          ? 'This course is still processing uploaded subsections. Enrollment opens when the queue is complete.'
          : 'This course has no lessons ready for enrollment yet.'
      );
      err.status = 409;
      throw err;
    }
  } catch (error) {
    if (error.status) throw error;
    if (error.response?.status === 404) {
      const err = new Error('Course not found.');
      err.status = 404;
      throw err;
    }
    if (error.response?.status >= 400) {
      const err = new Error(
        error.response.data?.message ||
          'Could not verify whether this course is ready for enrollment.'
      );
      err.status = error.response.status;
      throw err;
    }
    const err = new Error('Course service unavailable. Try enrolling again shortly.');
    err.status = 502;
    throw err;
  }
}

// POST /api/enrollments — enroll current student in a course
router.post('/', verifyToken, requireStudent, async (req, res) => {
  const courseId = String(req.body?.courseId || '').trim();
  const courseName = String(req.body?.courseName || '').trim();
  const educatorName = String(req.body?.educatorName || '').trim();

  if (!courseId) {
    return res.status(400).json({ message: 'courseId is required' });
  }

  try {
    const existing = await Enrollment.findOne({
      studentId: req.user.id,
      courseId,
    }).lean();

    if (existing) {
      return res.status(200).json({
        message: 'Already enrolled',
        enrollment: existing,
        alreadyEnrolled: true,
      });
    }

    await assertCourseEnrollmentOpen(courseId, req.get('x-gateway-secret'));

    const enrollment = await Enrollment.create({
      studentId: req.user.id,
      courseId,
      courseName,
      educatorName,
    });

    return res.status(201).json({
      message: 'Enrolled successfully',
      enrollment,
      alreadyEnrolled: false,
    });
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({ message: err.message });
    }
    if (err?.code === 11000) {
      const enrollment = await Enrollment.findOne({
        studentId: req.user.id,
        courseId,
      }).lean();
      return res.status(200).json({
        message: 'Already enrolled',
        enrollment,
        alreadyEnrolled: true,
      });
    }
    return handleServerError(res, err);
  }
});

// GET /api/enrollments/me — list enrollments for current student
router.get('/me', verifyToken, requireStudent, async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ studentId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      message: 'Enrollments loaded',
      data: enrollments,
      courseIds: enrollments.map((e) => String(e.courseId)),
    });
  } catch (err) {
    return handleServerError(res, err);
  }
});

module.exports = router;
