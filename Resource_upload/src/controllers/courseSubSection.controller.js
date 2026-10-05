const mongoose = require("mongoose");
const cloudinary = require("../config/cloudinary");
const CourseSection = require("../models/courseSection.model");
const CourseSubSection = require("../models/courseSubSection.model");
const {
  resolveEducatorNameFromRequest,
  ensureCourseEducatorName,
} = require("../utils/educatorDisplay");
const { assertVideoDurationLimit } = require("../utils/videoDuration");
const { parseContainsMath, hasContainsMathField } = require("../utils/parseContainsMath");
const { scheduleProcessSubsection } = require("../services/processLesson.service");
const {
  destroyCloudinaryImages,
  replaceExtractedBySource,
  mapExtractedImages,
} = require("../services/documentImage.service");
const {
  originalOfficeFileName,
  uploadRawDocument,
} = require("../utils/officeFiles");

const MAX_VIDEO = 100 * 1024 * 1024;
const MAX_OFFICE = 15 * 1024 * 1024;
const MAX_IMAGE = 100 * 1024 * 1024;

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      return resolve(result);
    });
    stream.end(buffer);
  });
}

const createSubSection = async (req, res) => {
  const { sectionId: sectionIdParam } = req.params;
  const educatorId = req.user?.id ? String(req.user.id).trim() : "";

  if (!educatorId || !mongoose.Types.ObjectId.isValid(educatorId)) {
    return res.status(400).json({ message: "Invalid educator session." });
  }

  if (!sectionIdParam || !mongoose.Types.ObjectId.isValid(sectionIdParam)) {
    return res.status(400).json({ message: "Invalid section id." });
  }

  const sectionObjectId = new mongoose.Types.ObjectId(sectionIdParam);
  const section = await CourseSection.findById(sectionObjectId).lean();
  if (!section) {
    return res.status(404).json({ message: "Section not found." });
  }

  if (String(section.educatorId) !== educatorId) {
    return res.status(403).json({ message: "Access denied for this section." });
  }

  const files = req.files || {};
  const videoFile = files.video?.[0];
  const pptFile = files.ppt?.[0];
  const pdfFile = files.pdf?.[0];
  const imageFiles = files.images || [];

  if (!videoFile?.buffer?.length) {
    return res.status(400).json({
      message: "Video is required for subsection. PPT, PDF, and images are optional.",
    });
  }

  if (videoFile?.size > MAX_VIDEO) {
    return res.status(400).json({ message: "Video must be 100MB or smaller." });
  }
  let videoDurationSec = 0;
  try {
    videoDurationSec = await assertVideoDurationLimit(videoFile);
  } catch (durationErr) {
    return res.status(400).json({
      message: durationErr.message || "Video must be 15 minutes or less.",
    });
  }
  if (pptFile?.size > MAX_OFFICE) {
    return res.status(400).json({ message: "PPT must be 15MB or smaller." });
  }
  if (pdfFile?.size > MAX_OFFICE) {
    return res.status(400).json({ message: "PDF must be 15MB or smaller." });
  }
  for (const img of imageFiles) {
    if (img.size > MAX_IMAGE) {
      return res.status(400).json({ message: "Each image must be 100MB or smaller." });
    }
    if (!img.mimetype.startsWith("image/")) {
      return res.status(400).json({ message: "Images must be image files." });
    }
  }

  const uploaded = {
    videoUrl: "",
    videoPublicId: "",
    pptUrl: "",
    pptPublicId: "",
    pptFileName: "",
    pdfUrl: "",
    pdfPublicId: "",
    pdfFileName: "",
    images: [],
    extractedImages: [],
    transcriptText: "",
    videoDurationSec,
    transcriptPreview: "",
    transcriptChunkCount: 0,
    containsMath: parseContainsMath(req.body),
  };

  const rollbackIds = [];

  try {
    if (!videoFile.mimetype.startsWith("video/")) {
      return res.status(400).json({ message: "Video file must be a video." });
    }

    const uploads = [
      uploadBuffer(videoFile.buffer, {
        folder: "upload_section_subsections/video",
        resource_type: "video",
      }).then((r) => {
        uploaded.videoUrl = r.secure_url;
        uploaded.videoPublicId = r.public_id;
        if (Number(r.duration) > 0) {
          uploaded.videoDurationSec = Number(r.duration);
        }
        rollbackIds.push(r.public_id);
      }),
    ];

    if (pptFile?.buffer?.length) {
      const fileName = originalOfficeFileName("ppt", pptFile.originalname);
      uploaded.pptFileName = fileName;
      uploads.push(
        uploadRawDocument(
          pptFile.buffer,
          "upload_section_subsections/ppt",
          fileName
        ).then((r) => {
          uploaded.pptUrl = r.secure_url;
          uploaded.pptPublicId = r.public_id;
          rollbackIds.push(r.public_id);
        })
      );
    }

    if (pdfFile?.buffer?.length) {
      const fileName = originalOfficeFileName("pdf", pdfFile.originalname);
      uploaded.pdfFileName = fileName;
      uploads.push(
        uploadRawDocument(
          pdfFile.buffer,
          "upload_section_subsections/pdf",
          fileName
        ).then((r) => {
          uploaded.pdfUrl = r.secure_url;
          uploaded.pdfPublicId = r.public_id;
          rollbackIds.push(r.public_id);
        })
      );
    }

    for (const img of imageFiles) {
      if (!img.buffer?.length) continue;
      uploads.push(
        uploadBuffer(img.buffer, {
          folder: "upload_section_subsections/images",
          resource_type: "image",
        }).then((r) => {
          uploaded.images.push({ url: r.secure_url, publicId: r.public_id });
          rollbackIds.push(r.public_id);
        })
      );
    }

    await Promise.all(uploads);
    uploaded.knowledgeStatus = "queued";
    uploaded.knowledgeStatusReason = "";

    const order = await CourseSubSection.countDocuments({
      sectionId: sectionObjectId,
    });
    const doc = await CourseSubSection.create({
      sectionId: sectionObjectId,
      courseId: section.courseId,
      educatorId: new mongoose.Types.ObjectId(educatorId),
      order,
      ...uploaded,
    });
    scheduleProcessSubsection(doc._id, {
      courseId: String(section.courseId),
      transcribe: true,
      extractImages: true,
      assets: {
        videoBuffer: videoFile.buffer,
        videoName: videoFile.originalname,
        pptBuffer: pptFile?.buffer || null,
        pptName: pptFile?.originalname || uploaded.pptFileName,
        pdfBuffer: pdfFile?.buffer || null,
        pdfName: pdfFile?.originalname || uploaded.pdfFileName,
      },
    });

    await ensureCourseEducatorName(
      section.courseId,
      resolveEducatorNameFromRequest(req)
    );

    return res.status(202).json({
      success: true,
      message:
        "Files saved and added to the processing queue. Subsections are processed one at a time. You will get a Chrome notification when each one is ready. Students can enroll after the course queue is complete.",
      data: {
        section: {
          id: section._id,
          sectionName: section.sectionName,
          courseId: section.courseId,
          sectionOrder: section.order,
        },
        subsection: {
          id: doc._id,
          sectionId: doc.sectionId,
          courseId: doc.courseId,
          order: doc.order,
          videoUrl: doc.videoUrl,
          pptUrl: doc.pptUrl,
          pdfUrl: doc.pdfUrl,
          images: doc.images,
          extractedImages: mapExtractedImages(doc.extractedImages),
          containsMath: doc.containsMath,
          knowledgeStatus: doc.knowledgeStatus,
          transcriptPreview: doc.transcriptPreview,
          transcriptChunkCount: doc.transcriptChunkCount,
          createdAt: doc.createdAt,
        },
      },
    });
  } catch (error) {
    console.error(error);
    for (const pid of rollbackIds) {
      cloudinary.uploader.destroy(pid, { resource_type: "auto" }).catch(() => {});
    }
    return res.status(500).json({
      message: error.message || "Failed to save subsection.",
    });
  }
};

const updateSubSection = async (req, res) => {
  const { sectionId: sectionIdParam, subsectionId } = req.params;
  const educatorId = req.user?.id ? String(req.user.id).trim() : "";

  if (!educatorId || !mongoose.Types.ObjectId.isValid(educatorId)) {
    return res.status(400).json({ message: "Invalid educator session." });
  }

  if (!sectionIdParam || !mongoose.Types.ObjectId.isValid(sectionIdParam)) {
    return res.status(400).json({ message: "Invalid section id." });
  }

  if (!subsectionId || !mongoose.Types.ObjectId.isValid(subsectionId)) {
    return res.status(400).json({ message: "Invalid subsection id." });
  }

  const sectionObjectId = new mongoose.Types.ObjectId(sectionIdParam);
  const section = await CourseSection.findById(sectionObjectId).lean();
  if (!section) {
    return res.status(404).json({ message: "Section not found." });
  }

  if (String(section.educatorId) !== educatorId) {
    return res.status(403).json({ message: "Access denied for this section." });
  }

  const doc = await CourseSubSection.findById(subsectionId);
  if (!doc) {
    return res.status(404).json({ message: "Subsection not found." });
  }

  if (String(doc.sectionId) !== String(sectionObjectId)) {
    return res.status(400).json({ message: "Subsection does not belong to this section." });
  }

  if (String(doc.educatorId) !== educatorId) {
    return res.status(403).json({ message: "Access denied for this subsection." });
  }

  const files = req.files || {};
  const videoFile = files.video?.[0];
  const pptFile = files.ppt?.[0];
  const pdfFile = files.pdf?.[0];
  const imageFiles = files.images || [];

  const nextContainsMath = hasContainsMathField(req.body)
    ? parseContainsMath(req.body)
    : Boolean(doc.containsMath);
  const mathModeChanged = nextContainsMath !== Boolean(doc.containsMath);

  const hasAny =
    Boolean(videoFile?.buffer?.length) ||
    Boolean(pptFile?.buffer?.length) ||
    Boolean(pdfFile?.buffer?.length) ||
    imageFiles.some((f) => f.buffer?.length) ||
    hasContainsMathField(req.body);

  if (!hasAny) {
    return res.status(400).json({
      message:
        "Provide at least one new file (video, PPT, PDF, or images) or update the equations option.",
    });
  }

  if (videoFile?.size > MAX_VIDEO) {
    return res.status(400).json({ message: "Video must be 100MB or smaller." });
  }
  let nextVideoDurationSec = Number(doc.videoDurationSec) || 0;
  if (videoFile?.buffer?.length) {
    try {
      nextVideoDurationSec = await assertVideoDurationLimit(videoFile);
    } catch (durationErr) {
      return res.status(400).json({
        message: durationErr.message || "Video must be 15 minutes or less.",
      });
    }
  }
  if (pptFile?.size > MAX_OFFICE) {
    return res.status(400).json({ message: "PPT must be 15MB or smaller." });
  }
  if (pdfFile?.size > MAX_OFFICE) {
    return res.status(400).json({ message: "PDF must be 15MB or smaller." });
  }
  for (const img of imageFiles) {
    if (img.size > MAX_IMAGE) {
      return res.status(400).json({ message: "Each image must be 100MB or smaller." });
    }
    if (img.buffer?.length && !img.mimetype.startsWith("image/")) {
      return res.status(400).json({ message: "Images must be image files." });
    }
  }

  const rollbackIds = [];

  try {
    const uploads = [];
    const videoChanged = Boolean(videoFile?.buffer?.length);
    const pptChanged = Boolean(pptFile?.buffer?.length);
    const pdfChanged = Boolean(pdfFile?.buffer?.length);
    const knowledgeInputsChanged = Boolean(
      videoChanged || pptChanged || pdfChanged || mathModeChanged
    );

    if (videoChanged) {
      if (!videoFile.mimetype.startsWith("video/")) {
        return res.status(400).json({ message: "Video file must be a video." });
      }
      if (doc.videoPublicId) {
        cloudinary.uploader
          .destroy(doc.videoPublicId, { resource_type: "video" })
          .catch(() => {});
      }
      uploads.push(
        uploadBuffer(videoFile.buffer, {
          folder: "upload_section_subsections/video",
          resource_type: "video",
        }).then((r) => {
          doc.videoUrl = r.secure_url;
          doc.videoPublicId = r.public_id;
          doc.videoDurationSec =
            Number(r.duration) > 0 ? Number(r.duration) : nextVideoDurationSec;
          rollbackIds.push(r.public_id);
        })
      );
    }

    if (pptChanged) {
      if (doc.pptPublicId) {
        cloudinary.uploader.destroy(doc.pptPublicId, { resource_type: "raw" }).catch(() => {});
      }
      destroyCloudinaryImages(
        (doc.extractedImages || []).filter((img) => img.source === "ppt")
      );
      doc.extractedImages = replaceExtractedBySource(doc.extractedImages, "ppt", []);
      const fileName = originalOfficeFileName("ppt", pptFile.originalname);
      uploads.push(
        uploadRawDocument(
          pptFile.buffer,
          "upload_section_subsections/ppt",
          fileName
        ).then((r) => {
          doc.pptUrl = r.secure_url;
          doc.pptPublicId = r.public_id;
          doc.pptFileName = fileName;
          rollbackIds.push(r.public_id);
        })
      );
    }

    if (pdfChanged) {
      if (doc.pdfPublicId) {
        cloudinary.uploader.destroy(doc.pdfPublicId, { resource_type: "raw" }).catch(() => {});
      }
      destroyCloudinaryImages(
        (doc.extractedImages || []).filter((img) => img.source === "pdf")
      );
      doc.extractedImages = replaceExtractedBySource(doc.extractedImages, "pdf", []);
      const fileName = originalOfficeFileName("pdf", pdfFile.originalname);
      uploads.push(
        uploadRawDocument(
          pdfFile.buffer,
          "upload_section_subsections/pdf",
          fileName
        ).then((r) => {
          doc.pdfUrl = r.secure_url;
          doc.pdfPublicId = r.public_id;
          doc.pdfFileName = fileName;
          rollbackIds.push(r.public_id);
        })
      );
    }

    if (imageFiles.some((f) => f.buffer?.length)) {
      if (Array.isArray(doc.images)) {
        for (const im of doc.images) {
          if (im.publicId) {
            cloudinary.uploader.destroy(im.publicId, { resource_type: "image" }).catch(() => {});
          }
        }
      }
      const imageUploads = [];
      for (const img of imageFiles) {
        if (!img.buffer?.length) continue;
        imageUploads.push(
          uploadBuffer(img.buffer, {
            folder: "upload_section_subsections/images",
            resource_type: "image",
          }).then((r) => {
            rollbackIds.push(r.public_id);
            return { url: r.secure_url, publicId: r.public_id };
          })
        );
      }
      uploads.push(
        Promise.all(imageUploads).then((newImages) => {
          doc.images = newImages;
        })
      );
    }

    await Promise.all(uploads);
    doc.containsMath = nextContainsMath;
    if (pptChanged || pdfChanged) {
      doc.markModified("extractedImages");
    }

    if (knowledgeInputsChanged) {
      doc.knowledgeStatus = "queued";
      doc.knowledgeStatusReason = "";
    }

    await doc.save();

    if (knowledgeInputsChanged) {
      scheduleProcessSubsection(doc._id, {
        courseId: String(doc.courseId),
        transcribe: videoChanged || !doc.transcriptText,
        extractImages: pptChanged || pdfChanged,
        assets: {
          videoBuffer: videoChanged ? videoFile.buffer : null,
          videoName: videoChanged ? videoFile.originalname : "",
          pptBuffer: pptChanged ? pptFile.buffer : null,
          pptName: pptChanged ? pptFile.originalname : doc.pptFileName,
          pdfBuffer: pdfChanged ? pdfFile.buffer : null,
          pdfName: pdfChanged ? pdfFile.originalname : doc.pdfFileName,
        },
      });
    }

    await ensureCourseEducatorName(
      section.courseId,
      resolveEducatorNameFromRequest(req)
    );

    return res.status(knowledgeInputsChanged ? 202 : 200).json({
      success: true,
      message: knowledgeInputsChanged
        ? "Files saved and queued. This subsection will process after earlier items in the course queue. You will get a Chrome notification when it is ready."
        : "Subsection updated.",
      data: {
        subsection: {
          id: doc._id,
          sectionId: doc.sectionId,
          courseId: doc.courseId,
          order: doc.order,
          videoUrl: doc.videoUrl,
          pptUrl: doc.pptUrl,
          pdfUrl: doc.pdfUrl,
          images: doc.images,
          extractedImages: mapExtractedImages(doc.extractedImages),
          containsMath: doc.containsMath,
          knowledgeStatus: doc.knowledgeStatus,
          updatedAt: doc.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error(error);
    for (const pid of rollbackIds) {
      cloudinary.uploader.destroy(pid, { resource_type: "auto" }).catch(() => {});
    }
    return res.status(500).json({
      message: error.message || "Failed to update subsection.",
    });
  }
};

const getSubSection = async (req, res) => {
  const { sectionId: sectionIdParam, subsectionId } = req.params;
  const educatorId = req.user?.id ? String(req.user.id).trim() : "";

  if (!educatorId || !mongoose.Types.ObjectId.isValid(educatorId)) {
    return res.status(400).json({ message: "Invalid educator session." });
  }
  if (!sectionIdParam || !mongoose.Types.ObjectId.isValid(sectionIdParam)) {
    return res.status(400).json({ message: "Invalid section id." });
  }
  if (!subsectionId || !mongoose.Types.ObjectId.isValid(subsectionId)) {
    return res.status(400).json({ message: "Invalid subsection id." });
  }

  const doc = await CourseSubSection.findById(subsectionId)
    .select(
      "sectionId educatorId knowledgeStatus knowledgeStatusReason transcriptPreview order courseId containsMath"
    )
    .lean();
  if (!doc) {
    return res.status(404).json({ message: "Subsection not found." });
  }
  if (String(doc.sectionId) !== String(sectionIdParam)) {
    return res.status(400).json({ message: "Subsection does not belong to this section." });
  }
  if (String(doc.educatorId) !== educatorId) {
    return res.status(403).json({ message: "Access denied for this subsection." });
  }

  return res.status(200).json({
    success: true,
    data: {
      id: doc._id,
      sectionId: doc.sectionId,
      courseId: doc.courseId,
      order: doc.order,
      containsMath: Boolean(doc.containsMath),
      knowledgeStatus: doc.knowledgeStatus || "ready",
      knowledgeStatusReason: doc.knowledgeStatusReason || "",
      transcriptPreview: doc.transcriptPreview || "",
    },
  });
};

module.exports = { createSubSection, updateSubSection, getSubSection };
