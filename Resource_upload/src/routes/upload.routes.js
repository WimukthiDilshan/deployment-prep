const express = require("express");
const ensureGatewayAccess = require("../middleware/gatewayAuth.middleware");
const uploadVideo = require("../middleware/upload.middleware");
const {
  healthCheck,
  createNameEntry,
  createNameWithVideo,
  getTranscriptChunksByUploadId,
  getUploadsWithTranscripts,
} = require("../controllers/upload.controller");

const router = express.Router();

router.get("/", healthCheck);
router.post("/names", ensureGatewayAccess, createNameEntry);
router.get("/uploads", ensureGatewayAccess, getUploadsWithTranscripts);
router.post(
  "/names-with-video",
  ensureGatewayAccess,
  uploadVideo.single("video"),
  createNameWithVideo
);
router.get(
  "/transcripts/:uploadId/chunks",
  ensureGatewayAccess,
  getTranscriptChunksByUploadId
);

module.exports = router;
