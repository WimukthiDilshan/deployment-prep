const express = require('express');
const Teacher = require('../models/Teacher');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

// Protected Dashboard route
router.get('/', verifyToken, async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user.id).lean();
    
    res.json({
      message: `Welcome to the Teacher Dashboard, ${req.user.name}!`,
      user: req.user,
      dashboardData: {
        activeCourses: 5,
        totalStudents: 120,
        upcomingClasses: 2,
        dbConfirmed: Boolean(teacher)
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching dashboard data' });
  }
});

module.exports = router;
