const mongoose = require("mongoose");
const cloudinary = require("../config/cloudinary");
const Course = require("../models/course.model");
const CourseSection = require("../models/courseSection.model");
const CourseSubSection = require("../models/courseSubSection.model");
const { resolveEducatorNameFromRequest } = require("../utils/educatorDisplay");
const { mapExtractedImages } = require("../services/documentImage.service");
const {
  originalOfficeFileName,
  mimeForFileName,
  contentDispositionAttachment,
  fileNameFromStoredUrl,
  fetchOriginalOfficeFile,
} = require("../utils/officeFiles");
const { filterWhisperNoise } = require("../services/whisperNoise.service");
const { buildUniqueKnowledgeChunk } = require("../services/knowledgeMerge.service");
const {
  isLessonReadyForStudents,
  isLessonPreparing,
  PREPARING_STATUSES,
  STUDENT_HIDDEN_STATUSES,
  computeEnrollmentOpen,
} = require("../utils/lessonVisibility");
const { getCourseQueueSnapshot } = require("../services/processLesson.service");

function parseKeywords(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

function uploadImageBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "upload_section_course_thumbnails",
        resource_type: "image",
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
}

const createCourse = async (req, res) => {
  const courseName = (req.body.courseName || "").trim();
  const description = (req.body.description || "").trim();
  const keywords = parseKeywords(req.body.keywords || "");
  const educatorId = req.user?.id ? String(req.user.id).trim() : "";
  const educatorName = resolveEducatorNameFromRequest(req);

  if (!educatorId || !mongoose.Types.ObjectId.isValid(educatorId)) {
    return res.status(400).json({ message: "Invalid educator session." });
  }

  if (!courseName) {
    return res.status(400).json({ message: "Course name is required." });
  }

  if (!req.file?.buffer) {
    return res.status(400).json({ message: "Thumbnail is required." });
  }

  let uploadResult;
  try {
    uploadResult = await uploadImageBuffer(req.file.buffer);
  } catch (error) {
    console.error("Cloudinary thumbnail upload failed:", error.message);
    return res.status(502).json({ message: "Failed to upload thumbnail." });
  }

  const thumbnailUrl = uploadResult.secure_url;

  try {
    const course = await Course.create({
      educatorId,
      educatorName,
      courseName,
      thumbnailUrl,
      keywords,
      description,
    });

    return res.status(201).json({
      success: true,
      message: "Course saved successfully",
      data: {
        id: course._id,
        courseName: course.courseName,
        thumbnailUrl: course.thumbnailUrl,
        keywords: course.keywords,
        description: course.description,
        educatorId: course.educatorId,
        educatorName: course.educatorName,
        createdAt: course.createdAt,
      },
    });
  } catch (error) {
    console.error(error);
    if (uploadResult?.public_id) {
      cloudinary.uploader.destroy(uploadResult.public_id).catch(() => {});
    }
    return res.status(500).json({ message: "Failed to save course." });
  }
};

const listPublicCourses = async (req, res) => {
  try {
    const rows = await Course.find({})
      .sort({ createdAt: -1 })
      .select("courseName thumbnailUrl educatorName")
      .lean();

    const courseIds = rows.map((c) => c._id);
    const lessonStats = courseIds.length
      ? await CourseSubSection.aggregate([
          { $match: { courseId: { $in: courseIds } } },
          {
            $group: {
              _id: "$courseId",
              readyLessonCount: {
                $sum: {
                  $cond: [
                    {
                      $in: [
                        { $ifNull: ["$knowledgeStatus", "ready"] },
                        STUDENT_HIDDEN_STATUSES,
                      ],
                    },
                    0,
                    1,
                  ],
                },
              },
              preparingLessonCount: {
                $sum: {
                  $cond: [
                    {
                      $in: [
                        { $ifNull: ["$knowledgeStatus", "ready"] },
                        PREPARING_STATUSES,
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ])
      : [];
    const statsByCourse = new Map(
      lessonStats.map((row) => [String(row._id), row])
    );

    const data = rows.map((c) => {
      const stats = statsByCourse.get(String(c._id));
      const readyLessonCount = Number(stats?.readyLessonCount || 0);
      const preparingLessonCount = Number(stats?.preparingLessonCount || 0);
      return {
        id: c._id,
        courseName: c.courseName,
        thumbnailUrl: c.thumbnailUrl,
        educatorName: (c.educatorName || "").trim(),
        readyLessonCount,
        preparingLessonCount,
        lessonsAvailable: readyLessonCount > 0,
        enrollmentOpen: computeEnrollmentOpen(
          readyLessonCount,
          preparingLessonCount
        ),
      };
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load courses." });
  }
};

const getPublicCourseDetail = async (req, res) => {
  const { courseId } = req.params;

  if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ message: "Invalid course id." });
  }

  try {
    const course = await Course.findById(courseId)
      .select("courseName thumbnailUrl educatorName keywords description")
      .lean();

    if (!course) {
      return res.status(404).json({ message: "Course not found." });
    }

    const sections = await CourseSection.find({ courseId })
      .sort({ order: 1, createdAt: 1 })
      .select("sectionName order")
      .lean();

    const subs = await CourseSubSection.find({ courseId })
      .sort({ order: 1, createdAt: 1 })
      .select("sectionId order videoUrl videoDurationSec pptUrl pptFileName pdfUrl pdfFileName images extractedImages transcriptText pptText pdfText dedupedTranscriptText dedupedPptText dedupedPdfText containsMath equations knowledgeStatus")
      .lean();

    const subsectionsBySection = new Map();
    let preparingLessonCount = 0;
    let readyLessonCount = 0;
    for (const sub of subs) {
      if (isLessonPreparing(sub.knowledgeStatus)) {
        preparingLessonCount += 1;
      }
      if (!isLessonReadyForStudents(sub.knowledgeStatus)) {
        continue;
      }
      readyLessonCount += 1;
      const sid = String(sub.sectionId);
      if (!subsectionsBySection.has(sid)) {
        subsectionsBySection.set(sid, []);
      }
      const hasDedupe = Boolean(
        sub.dedupedPptText || sub.dedupedPdfText || sub.dedupedTranscriptText
      );
      const knowledgeChunk = buildUniqueKnowledgeChunk({
        ppt: hasDedupe ? sub.dedupedPptText : sub.pptText,
        pdf: hasDedupe ? sub.dedupedPdfText : sub.pdfText,
        transcript: hasDedupe
          ? sub.dedupedTranscriptText
          : filterWhisperNoise(sub.transcriptText),
        equations: sub.equations,
        containsMath: Boolean(sub.containsMath),
      });
      subsectionsBySection.get(sid).push({
        id: sub._id,
        order: sub.order,
        videoUrl: sub.videoUrl || "",
        videoDurationSec: Number(sub.videoDurationSec) || 0,
        pptUrl: sub.pptUrl || "",
        pptFileName: sub.pptFileName || "",
        pdfUrl: sub.pdfUrl || "",
        pdfFileName: sub.pdfFileName || "",
        containsMath: Boolean(sub.containsMath),
        knowledgeStatus: sub.knowledgeStatus || "ready",
        knowledgeChunk,
        images: Array.isArray(sub.images)
          ? sub.images.map((img) => ({ url: img.url }))
          : [],
        extractedImages: mapExtractedImages(sub.extractedImages),
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        course: {
          id: course._id,
          courseName: course.courseName,
          thumbnailUrl: course.thumbnailUrl,
          educatorName: (course.educatorName || "").trim(),
          keywords: course.keywords || [],
          description: course.description || "",
        },
        preparingLessonCount,
        readyLessonCount,
        enrollmentOpen: computeEnrollmentOpen(
          readyLessonCount,
          preparingLessonCount
        ),
        sections: sections.map((s) => ({
          id: s._id,
          sectionName: s.sectionName,
          order: s.order,
          subsections: subsectionsBySection.get(String(s._id)) || [],
        })),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load course." });
  }
};

const downloadPublicSubsectionFile = async (req, res) => {
  const { courseId, subsectionId, kind } = req.params;
  const type = String(kind || "").toLowerCase();

  if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ message: "Invalid course id." });
  }
  if (!subsectionId || !mongoose.Types.ObjectId.isValid(subsectionId)) {
    return res.status(400).json({ message: "Invalid subsection id." });
  }
  if (type !== "ppt" && type !== "pdf") {
    return res.status(400).json({ message: "File type must be ppt or pdf." });
  }

  try {
    const doc = await CourseSubSection.findById(subsectionId)
      .select(
        "courseId pptUrl pptPublicId pptFileName pdfUrl pdfPublicId pdfFileName knowledgeStatus"
      )
      .lean();

    if (!doc || String(doc.courseId) !== String(courseId)) {
      return res.status(404).json({ message: "File not found." });
    }
    if (!isLessonReadyForStudents(doc.knowledgeStatus)) {
      return res.status(404).json({
        message: "This lesson is still being prepared.",
      });
    }

    const storedUrl = type === "ppt" ? doc.pptUrl : doc.pdfUrl;
    const publicId = type === "ppt" ? doc.pptPublicId : doc.pdfPublicId;
    if (!storedUrl && !publicId) {
      return res.status(404).json({
        message: `No ${type.toUpperCase()} is stored for this subsection.`,
      });
    }

    const storedName = type === "ppt" ? doc.pptFileName : doc.pdfFileName;
    const fromUrl = fileNameFromStoredUrl(storedUrl, "");
    const fileName = originalOfficeFileName(type, storedName || fromUrl);

    const buffer = await fetchOriginalOfficeFile({
      storedUrl,
      publicId,
      fileName,
      kind: type,
    });

    res.writeHead(200, {
      "Content-Type": mimeForFileName(fileName),
      "Content-Disposition": contentDispositionAttachment(fileName),
      "Content-Length": String(buffer.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=120",
    });
    return res.end(buffer);
  } catch (error) {
    console.error("[download-subsection-file]", error);
    return res.status(502).json({
      message: `Could not download the original ${type.toUpperCase()} the teacher uploaded.`,
    });
  }
};

const listMyCourses = async (req, res) => {
  const educatorId = req.user?.id ? String(req.user.id).trim() : "";

  if (!educatorId || !mongoose.Types.ObjectId.isValid(educatorId)) {
    return res.status(400).json({ message: "Invalid educator session." });
  }

  try {
    const rows = await Course.find({ educatorId })
      .sort({ createdAt: -1 })
      .select("courseName thumbnailUrl createdAt")
      .lean();

    const data = rows.map((c) => ({
      id: c._id,
      courseName: c.courseName,
      thumbnailUrl: c.thumbnailUrl,
      createdAt: c.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load your courses." });
  }
};

const getCourseForEdit = async (req, res) => {
  const { courseId } = req.params;
  const educatorId = req.user?.id ? String(req.user.id).trim() : "";

  if (!educatorId || !mongoose.Types.ObjectId.isValid(educatorId)) {
    return res.status(400).json({ message: "Invalid educator session." });
  }

  if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ message: "Invalid course id." });
  }

  try {
    const course = await Course.findById(courseId)
      .select("courseName thumbnailUrl keywords description educatorId")
      .lean();

    if (!course) {
      return res.status(404).json({ message: "Course not found." });
    }

    if (String(course.educatorId) !== educatorId) {
      return res.status(403).json({ message: "You can only edit your own courses." });
    }

    const cid = course._id;
    const sections = await CourseSection.find({ courseId: cid })
      .sort({ order: 1, createdAt: 1 })
      .select("sectionName order")
      .lean();

    const subs = await CourseSubSection.find({ courseId: cid })
      .sort({ order: 1, createdAt: 1 })
      .select("sectionId order videoUrl pptUrl pdfUrl images extractedImages containsMath knowledgeStatus")
      .lean();

    const subsectionsBySection = new Map();
    for (const sub of subs) {
      const sid = String(sub.sectionId);
      if (!subsectionsBySection.has(sid)) {
        subsectionsBySection.set(sid, []);
      }
      subsectionsBySection.get(sid).push({
        id: sub._id,
        order: sub.order,
        videoUrl: sub.videoUrl || "",
        pptUrl: sub.pptUrl || "",
        pdfUrl: sub.pdfUrl || "",
        containsMath: Boolean(sub.containsMath),
        knowledgeStatus: sub.knowledgeStatus || "ready",
        images: Array.isArray(sub.images)
          ? sub.images.map((img) => ({ url: img.url }))
          : [],
        extractedImages: mapExtractedImages(sub.extractedImages),
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: course._id,
        educatorId: course.educatorId,
        courseName: course.courseName,
        thumbnailUrl: course.thumbnailUrl,
        keywords: course.keywords || [],
        description: course.description || "",
        sections: sections.map((s) => ({
          id: s._id,
          sectionName: s.sectionName,
          order: s.order,
          subsections: subsectionsBySection.get(String(s._id)) || [],
        })),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load course." });
  }
};

const updateCourse = async (req, res) => {
  const { courseId } = req.params;
  const educatorId = req.user?.id ? String(req.user.id).trim() : "";
  const courseName = (req.body.courseName || "").trim();
  const description = (req.body.description || "").trim();
  const keywords = parseKeywords(req.body.keywords || "");
  const educatorName = resolveEducatorNameFromRequest(req);

  if (!educatorId || !mongoose.Types.ObjectId.isValid(educatorId)) {
    return res.status(400).json({ message: "Invalid educator session." });
  }

  if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ message: "Invalid course id." });
  }

  if (!courseName) {
    return res.status(400).json({ message: "Course name is required." });
  }

  try {
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found." });
    }

    if (String(course.educatorId) !== educatorId) {
      return res.status(403).json({ message: "You can only update your own courses." });
    }

    course.courseName = courseName;
    course.description = description;
    course.keywords = keywords;
    if (educatorName) {
      course.educatorName = educatorName;
    }

    if (req.file?.buffer) {
      let uploadResult;
      try {
        uploadResult = await uploadImageBuffer(req.file.buffer);
      } catch (error) {
        console.error("Cloudinary thumbnail upload failed:", error.message);
        return res.status(502).json({ message: "Failed to upload thumbnail." });
      }
      course.thumbnailUrl = uploadResult.secure_url;
    }

    await course.save();

    return res.status(200).json({
      success: true,
      message: "Course updated.",
      data: {
        id: course._id,
        courseName: course.courseName,
        thumbnailUrl: course.thumbnailUrl,
        keywords: course.keywords,
        description: course.description,
        educatorName: course.educatorName,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to update course." });
  }
};

const deleteCourse = async (req, res) => {
  const { courseId } = req.params;
  const educatorId = req.user?.id ? String(req.user.id).trim() : "";

  if (!educatorId || !mongoose.Types.ObjectId.isValid(educatorId)) {
    return res.status(400).json({ message: "Invalid educator session." });
  }

  if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ message: "Invalid course id." });
  }

  try {
    const course = await Course.findById(courseId).select("educatorId").lean();
    if (!course) {
      return res.status(404).json({ message: "Course not found." });
    }

    if (String(course.educatorId) !== educatorId) {
      return res.status(403).json({ message: "You can only delete your own courses." });
    }

    const cid = new mongoose.Types.ObjectId(courseId);

    await CourseSubSection.deleteMany({ courseId: cid });
    await CourseSection.deleteMany({ courseId: cid });
    await Course.deleteOne({ _id: cid });

    return res.status(200).json({
      success: true,
      message: "Course deleted.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to delete course." });
  }
};

const getProcessingQueue = async (req, res) => {
  const { courseId } = req.params;
  const educatorId = req.user?.id ? String(req.user.id).trim() : "";

  if (!educatorId || !mongoose.Types.ObjectId.isValid(educatorId)) {
    return res.status(400).json({ message: "Invalid educator session." });
  }
  if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ message: "Invalid course id." });
  }

  try {
    const course = await Course.findById(courseId)
      .select("educatorId courseName")
      .lean();
    if (!course) {
      return res.status(404).json({ message: "Course not found." });
    }
    if (String(course.educatorId) !== educatorId) {
      return res.status(403).json({
        message: "You can only view the processing queue for your own courses.",
      });
    }

    const cid = course._id;
    const [preparingLessonCount, readyLessonCount] = await Promise.all([
      CourseSubSection.countDocuments({
        courseId: cid,
        knowledgeStatus: { $in: PREPARING_STATUSES },
      }),
      CourseSubSection.countDocuments({
        courseId: cid,
        knowledgeStatus: { $nin: STUDENT_HIDDEN_STATUSES },
      }),
    ]);
    const snapshot = getCourseQueueSnapshot(String(cid));
    const pendingCount = Math.max(
      Number(snapshot.pendingCount) || 0,
      Number(preparingLessonCount) || 0
    );
    const completedCount = Number(snapshot.completedCount) || 0;
    const totalCount = Math.max(
      Number(snapshot.totalCount) || 0,
      completedCount + pendingCount
    );
    const percent =
      pendingCount === 0 && (totalCount > 0 || preparingLessonCount === 0)
        ? 100
        : totalCount <= 0
          ? 0
          : Math.round((Math.min(completedCount, totalCount) / totalCount) * 100);

    return res.status(200).json({
      success: true,
      data: {
        courseId: cid,
        courseName: course.courseName || "",
        ...snapshot,
        pendingCount,
        completedCount,
        totalCount,
        percent,
        preparingLessonCount,
        readyLessonCount,
        enrollmentOpen: computeEnrollmentOpen(
          readyLessonCount,
          preparingLessonCount
        ),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load processing queue." });
  }
};

module.exports = {
  createCourse,
  listPublicCourses,
  getPublicCourseDetail,
  downloadPublicSubsectionFile,
  listMyCourses,
  getCourseForEdit,
  getProcessingQueue,
  updateCourse,
  deleteCourse,
};
