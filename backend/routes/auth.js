const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

const getJwtSecret = () => process.env.JWT_SECRET || 'fallback_secret_key';

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'Admin') {
    return res.status(403).json({ message: 'Admin access only.' });
  }
  next();
};

// Helper for sending generic error responses
const handleServerError = (res, err) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
};

// Resolve cognitive-load student IDs to display names for authenticated
// teachers. Only names are returned; private student fields remain hidden.
router.get('/student-names', verifyToken, async (req, res) => {
  if (req.user?.role === 'Student') {
    return res.status(403).json({ message: 'Teacher access only.' });
  }

  const requestedIds = String(req.query?.ids || '')
    .split(',')
    .map((id) => id.trim())
    .filter((id, index, values) => id && values.indexOf(id) === index)
    .slice(0, 200);
  const validIds = requestedIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

  if (!validIds.length) {
    return res.json({ data: [] });
  }

  try {
    const students = await Student.find({ _id: { $in: validIds } })
      .select('name')
      .lean();
    return res.json({
      data: students.map((student) => ({
        student_id: String(student._id),
        student_name: student.name,
      })),
    });
  } catch (err) {
    return handleServerError(res, err);
  }
});

// Register endpoint
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    // Check if user exists
    const existing = await Teacher.findOne({ email: email.toLowerCase() }).lean();
    if (existing) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    await Teacher.create({
      name: name.trim(),
      email: email.toLowerCase(),
      password: hashedPassword,
      approvalStatus: 'pending',
    });

    res.status(201).json({
      message: 'Registration submitted. Please wait for admin approval before logging in.',
      approvalStatus: 'pending',
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

//Student registration endpoint
router.post('/student/register', async (req, res) => {
  const { name, email, mobileNumber, password, confirmPassword } = req.body;

  // Validate required fields
  if (!name || !email || !mobileNumber || !password || !confirmPassword) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  // Check password match
  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords do not match' });
  }

  try {
    // Check if student already exists
    const existing = await Student.findOne({ email: email.toLowerCase() }).lean();
    if (existing) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert student
    await Student.create({
      name: name.trim(),
      email: email.toLowerCase(),
      mobileNumber: mobileNumber.trim(),
      role: 'Student',
      password: hashedPassword,
    });

    res.status(201).json({ message: 'Student registered successfully' });
  } catch (err) {
    handleServerError(res, err);
  }
});


// Login endpoint
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    // Find user
    // `lean()` keeps a missing approvalStatus distinguishable for legacy accounts.
    const user = await Teacher.findOne({ email: email.toLowerCase() }).lean();
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Existing teachers created before the approval feature remain approved.
    const approvalStatus = user.approvalStatus || 'approved';
    if (approvalStatus === 'pending') {
      return res.status(403).json({
        code: 'TEACHER_APPROVAL_PENDING',
        message: 'Your registration is waiting for admin approval.',
      });
    }
    if (approvalStatus === 'rejected') {
      return res.status(403).json({
        code: 'TEACHER_APPROVAL_REJECTED',
        message: 'Your teacher registration was rejected. Please contact the administrator.',
      });
    }

    // Generate JWT
    const token = jwt.sign({ id: user._id, name: user.name, email: user.email, role: 'Teacher' }, getJwtSecret(), {
      expiresIn: '1d'
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: 'Teacher',
        approvalStatus,
      }
    });

  } catch (err) {
    handleServerError(res, err);
  }
});

// Development admin login. Override both values in backend/.env for deployment.
router.post('/admin/login', (req, res) => {
  const { email, password } = req.body;
  const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@gmail.com').trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || 'admin123');

  if (
    String(email || '').trim().toLowerCase() !== adminEmail ||
    String(password || '') !== adminPassword
  ) {
    return res.status(401).json({ message: 'Invalid admin email or password.' });
  }

  const token = jwt.sign(
    { email: adminEmail, role: 'Admin' },
    getJwtSecret(),
    { expiresIn: '8h' }
  );

  return res.json({
    message: 'Admin login successful',
    token,
    user: { email: adminEmail, name: 'Administrator', role: 'Admin' },
  });
});

router.get('/admin/teachers', verifyToken, requireAdmin, async (_req, res) => {
  try {
    const teachers = await Teacher.find()
      .select('name email approvalStatus reviewedAt createdAt')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      teachers: teachers.map((teacher) => ({
        ...teacher,
        // Accounts that predate this feature are kept active.
        approvalStatus: teacher.approvalStatus || 'approved',
      })),
    });
  } catch (err) {
    return handleServerError(res, err);
  }
});

router.patch('/admin/teachers/:teacherId/approval', verifyToken, requireAdmin, async (req, res) => {
  const { teacherId } = req.params;
  const { status } = req.body;

  if (!mongoose.Types.ObjectId.isValid(teacherId)) {
    return res.status(400).json({ message: 'Invalid teacher ID.' });
  }
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status must be approved or rejected.' });
  }

  try {
    const teacher = await Teacher.findByIdAndUpdate(
      teacherId,
      { approvalStatus: status, reviewedAt: new Date() },
      { new: true, runValidators: true }
    ).select('name email approvalStatus reviewedAt createdAt');

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found.' });
    }

    return res.json({
      message: `Teacher ${status} successfully.`,
      teacher,
    });
  } catch (err) {
    return handleServerError(res, err);
  }
});



// Student login endpoint
router.post('/student/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    // Find student
    const student = await Student.findOne({ email: email.toLowerCase() });
    if (!student) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: student._id,
        name: student.name,
        email: student.email,
        role: student.role,
      },
      getJwtSecret(),
      { expiresIn: '1d' }
    );

    res.json({
      message: 'Student login successful',
      token,
      user: {
        id: student._id,
        name: student.name,
        email: student.email,
        mobileNumber: student.mobileNumber,
        role: student.role,
        learnerProfile: student.learnerProfile || '',
        visualVerbalCognitiveStyle: student.visualVerbalCognitiveStyle || '',
        analyticWholisticCognitiveStyle: student.analyticWholisticCognitiveStyle || '',
      },
    });
  } catch (err) {
    handleServerError(res, err);
  }
});

// Get student details by ID
router.get('/student/:id', async (req, res) => {
  try {
    const studentId = req.params.id;

    // Find student and exclude the password field for security
    const student = await Student.findById(studentId).select('-password');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json({
      message: 'Student details retrieved successfully',
      student
    });
    
  } catch (err) {
    // Handle invalid MongoDB ObjectId format
    if (err.name === 'CastError' && err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Student not found' });
    }
    handleServerError(res, err);
  }
});

module.exports = router;
