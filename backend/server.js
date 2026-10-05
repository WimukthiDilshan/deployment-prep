require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Import routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const lessonsRoutes = require('./routes/lessons');
const examRoutes = require('./routes/exam');
const enrollmentRoutes = require('./routes/enrollments');
const studentLessonSummaryRoutes = require('./routes/studentLessonSummaries');

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/lessons', lessonsRoutes);
app.use('/api/exam', examRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/student-lesson-summaries', studentLessonSummaryRoutes);

const mongoUri =
  process.env.MONGO_URI ||
  'mongodb+srv://root:root@userdb.n9pyyat.mongodb.net/?appName=UserDB';

mongoose
  .connect(mongoUri, { dbName: 'userdb' })
  .then(() => {
    console.log('Connected to MongoDB (userdb)');
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  });
