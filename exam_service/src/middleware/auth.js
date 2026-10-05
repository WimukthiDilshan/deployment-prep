function requireTeacher(req, res, next) {
  const teacherId = String(req.headers['x-teacher-id'] || '').trim();
  if (!teacherId) return res.status(403).json({ message: 'Teacher context is required.' });
  req.teacher = { id: teacherId };
  return next();
}

module.exports = requireTeacher;
