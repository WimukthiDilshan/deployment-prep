const express = require("express");
const multer = require("multer");
const ensureGatewayAccess = require("../middleware/gatewayAuth.middleware");
const verifyTeacherJwt = require("../middleware/verifyTeacherJwt.middleware");
const {
  createSubSection,
  updateSubSection,
  getSubSection,
} = require("../controllers/courseSubSection.controller");

const router = express.Router();

const uploadSub = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "video" && file.originalname) {
      const lower = file.originalname.toLowerCase();
      const extOk = [".mp4", ".webm", ".mov", ".mkv", ".m4v", ".avi"].some((ext) =>
        lower.endsWith(ext)
      );
      if (!file.mimetype.startsWith("video/") && !extOk) {
        return cb(new Error("Video must be a video file."));
      }
    }
    if (file.fieldname === "ppt" && file.originalname) {
      const lower = file.originalname.toLowerCase();
      if (!lower.endsWith(".ppt") && !lower.endsWith(".pptx")) {
        return cb(new Error("PPT must be a .ppt or .pptx file."));
      }
    }
    if (file.fieldname === "pdf" && file.originalname) {
      const lower = file.originalname.toLowerCase();
      if (!lower.endsWith(".pdf")) {
        return cb(new Error("PDF must be a .pdf file."));
      }
    }
    if (file.fieldname === "images" && file.originalname) {
      if (!file.mimetype.startsWith("image/")) {
        return cb(new Error("Images must be image files."));
      }
    }
    cb(null, true);
  },
});

const subsectionUploadMiddleware = (req, res, next) => {
  uploadSub.fields([
    { name: "video", maxCount: 1 },
    { name: "ppt", maxCount: 1 },
    { name: "pdf", maxCount: 1 },
    { name: "images", maxCount: 15 },
  ])(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "One of the files exceeds the 100MB size limit." });
    }
    return res.status(400).json({ message: err.message || "Invalid upload." });
  });
};

router.get(
  "/sections/:sectionId/subsections/:subsectionId",
  ensureGatewayAccess,
  verifyTeacherJwt,
  getSubSection
);

router.patch(
  "/sections/:sectionId/subsections/:subsectionId",
  ensureGatewayAccess,
  verifyTeacherJwt,
  subsectionUploadMiddleware,
  updateSubSection
);

router.post(
  "/sections/:sectionId/subsections",
  ensureGatewayAccess,
  verifyTeacherJwt,
  subsectionUploadMiddleware,
  createSubSection
);

module.exports = router;
