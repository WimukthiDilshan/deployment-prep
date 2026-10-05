require("dotenv").config({ quiet: true });
const express = require("express");
const cors = require("cors");
const deepseekRoutes = require("./routes/deepseek");

const app = express();
const port = Number(process.env.PORT) || 5004;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "deepseek-service" });
});

app.use("/api/deepseek", deepseekRoutes);

const server = app.listen(port, (err) => {
  if (err) {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use.`);
      console.error("Stop the other process, then run npm start again.");
    } else {
      console.error("Failed to start deepseek-service:", err.message);
    }
    process.exit(1);
    return;
  }
  console.log(`deepseek-service listening on http://localhost:${port}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use.`);
  } else {
    console.error("Failed to start deepseek-service:", err.message);
  }
  process.exit(1);
});
