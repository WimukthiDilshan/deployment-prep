require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { initializeDatabase } = require('./config/database');
const materialRoutes = require('./routes/materials');
const quizRoutes = require('./routes/quizzes');

const app = express();
const port = Number(process.env.PORT || 8120);

app.use(cors());
app.use(express.json());
app.get('/health', (_req, res) => res.json({ message: 'Exam service is running.' }));
app.use('/materials', materialRoutes);
app.use('/quizzes', quizRoutes);

initializeDatabase()
  .then(() => app.listen(port, () => console.log(`Exam service running on http://localhost:${port}`)))
  .catch((error) => {
    console.error('Exam service database initialization failed:', error.message);
    process.exit(1);
  });
