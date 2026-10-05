require("dotenv").config();
const app = require("./src/app");
const connectDatabase = require("./src/config/database");
const {
  recoverInterruptedLessonJobs,
} = require("./src/services/processLesson.service");

const PORT = process.env.PORT || 5000;
connectDatabase()
  .then(async () => {
    console.log("Connected to MongoDB (upload_section)");
    await recoverInterruptedLessonJobs();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  });
