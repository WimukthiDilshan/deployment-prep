const express = require("express");
const mongoose = require("mongoose");
const uploadRoutes = require("./routes/upload.routes");
const courseRoutes = require("./routes/course.routes");
const subsectionRoutes = require("./routes/subsection.routes");
const pushRoutes = require("./routes/push.routes");
const handleErrors = require("./middleware/error.middleware");

const app = express();

app.get("/health", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "database_disconnected",
    service: "resource-upload",
  });
});
app.use(express.json());
app.use("/", uploadRoutes);
app.use("/", courseRoutes);
app.use("/", subsectionRoutes);
app.use("/", pushRoutes);
app.use(handleErrors);

module.exports = app;
