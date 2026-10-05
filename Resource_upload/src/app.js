const express = require("express");
const uploadRoutes = require("./routes/upload.routes");
const courseRoutes = require("./routes/course.routes");
const subsectionRoutes = require("./routes/subsection.routes");
const pushRoutes = require("./routes/push.routes");
const handleErrors = require("./middleware/error.middleware");

const app = express();

app.use(express.json());
app.use("/", uploadRoutes);
app.use("/", courseRoutes);
app.use("/", subsectionRoutes);
app.use("/", pushRoutes);
app.use(handleErrors);

module.exports = app;
