require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const gptRoutes = require("./routes/gpt");

const app = express();
const port = process.env.PORT || 5002;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "gpt-service" });
});

app.use("/api/gpt", gptRoutes);

const mongoUri = process.env.MONGO_URI;
const dbName =
  process.env.MONGO_DB_NAME ||
  process.env.CONTENT_TRANSFER_DB ||
  "content_transfer";

if (!mongoUri) {
  console.error("MONGO_URI is required in gpt-service/.env");
  process.exit(1);
}

mongoose
  .connect(mongoUri, { dbName })
  .then(() => {
    console.log(`Connected to MongoDB database: ${dbName}`);
    app.listen(port, () => {
      const hfOn =
        String(process.env.HF_GENERATION_ENABLED ?? "true")
          .trim()
          .toLowerCase() !== "false";
      console.log(
        `gpt-service listening on http://localhost:${port} (HF generation ${
          hfOn ? "ON" : "OFF"
        })`
      );
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  });
