const mongoose = require("mongoose");
const CourseSection = require("../models/courseSection.model");
const CourseSubSection = require("../models/courseSubSection.model");
const CourseWatchProgress = require("../models/courseWatchProgress.model");
const { isLessonReadyForStudents } = require("../utils/lessonVisibility");
const {
  MAX_VIDEO_SEC,
  normalizeIntervals,
  coveredSeconds,
} = require("../utils/watchIntervals");

function userIdFromRequest(req) {
  return req.user?.id ? String(req.user.id).trim() : "";
}

function serializeLessons(lessons) {
  const map = {};
  for (const lesson of Array.isArray(lessons) ? lessons : []) {
    const id = String(lesson.subsectionId || "");
    if (!id) continue;
    const durationSec = Math.max(0, Number(lesson.durationSec) || 0);
    const intervals = normalizeIntervals(lesson.intervals, durationSec || MAX_VIDEO_SEC);
    const watchedSec = Math.min(
      durationSec || coveredSeconds(intervals),
      coveredSeconds(intervals)
    );
    map[id] = {
      durationSec,
      intervals,
      watchedSec: Math.round(watchedSec * 100) / 100,
    };
  }
  return map;
}

async function loadReadyVideoLessons(courseId) {
  const subs = await CourseSubSection.find({ courseId })
    .select("videoUrl videoDurationSec knowledgeStatus order sectionId")
    .sort({ order: 1 })
    .lean();

  return (subs || []).filter(
    (sub) =>
      isLessonReadyForStudents(sub.knowledgeStatus) && Boolean(sub.videoUrl)
  );
}

async function loadSectionNames(courseId) {
  const rows = await CourseSection.find({ courseId }).select("sectionName").lean();
  return Object.fromEntries(
    (rows || []).map((row) => [String(row._id), String(row.sectionName || "").trim()])
  );
}

function buildSummary(videoLessons, lessonMap, sectionNameById = {}) {
  let totalSec = 0;
  let watchedSec = 0;
  const ranked = [...(videoLessons || [])].sort(
    (left, right) => (Number(left.order) || 0) - (Number(right.order) || 0)
  );
  const scored = ranked.map((sub, index) => {
    const stored = lessonMap[String(sub._id)] || {};
    const durationSec = Math.max(
      0,
      Number(stored.durationSec) || Number(sub.videoDurationSec) || 0
    );
    const uniqueSec = Math.min(durationSec, Number(stored.watchedSec) || 0);
    if (durationSec > 0) {
      totalSec += durationSec;
      watchedSec += uniqueSec;
    }
    const percent = durationSec > 0 ? (uniqueSec / durationSec) * 100 : 0;
    return { sub, index, durationSec, uniqueSec, percent };
  });

  const resume =
    scored.find((item) => item.percent > 0 && item.percent < 95) ||
    scored.find((item) => item.percent <= 0) ||
    scored[scored.length - 1] ||
    null;
  const sectionName = resume
    ? String(sectionNameById[String(resume.sub.sectionId)] || "").trim()
    : "";

  const percent = totalSec > 0 ? (watchedSec / totalSec) * 100 : 0;
  return {
    watchedSec: Math.round(watchedSec * 100) / 100,
    totalSec: Math.round(totalSec * 100) / 100,
    percent: Math.round(Math.max(0, Math.min(100, percent)) * 10) / 10,
    videoCount: ranked.length,
    lectureTitle: sectionName || (resume ? `Lecture ${resume.index + 1}` : "Lecture"),
    lectureDurationSec: Math.round(Number(resume?.durationSec) || 0),
    lessons: lessonMap,
  };
}

const getWatchProgress = async (req, res) => {
  const { courseId } = req.params;
  const userId = userIdFromRequest(req);

  if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ message: "Invalid course id." });
  }

  try {
    const [videoLessons, sectionNameById] = await Promise.all([
      loadReadyVideoLessons(courseId),
      loadSectionNames(courseId),
    ]);
    if (!userId) {
      return res.status(200).json({
        success: true,
        data: buildSummary(videoLessons, {}, sectionNameById),
      });
    }

    const doc = await CourseWatchProgress.findOne({
      userId,
      courseId,
    }).lean();

    return res.status(200).json({
      success: true,
      data: buildSummary(
        videoLessons,
        serializeLessons(doc?.lessons),
        sectionNameById
      ),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load watch progress." });
  }
};

const upsertWatchProgress = async (req, res) => {
  const { courseId } = req.params;
  const userId = userIdFromRequest(req);
  const subsectionId = String(req.body?.subsectionId || "").trim();

  if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ message: "Invalid course id." });
  }
  if (!subsectionId || !mongoose.Types.ObjectId.isValid(subsectionId)) {
    return res.status(400).json({ message: "Invalid subsection id." });
  }

  const durationSec = Math.min(
    MAX_VIDEO_SEC,
    Math.max(0, Number(req.body?.durationSec) || 0)
  );
  const incomingIntervals = normalizeIntervals(req.body?.intervals, durationSec);

  try {
    const sub = await CourseSubSection.findById(subsectionId)
      .select("courseId videoUrl videoDurationSec knowledgeStatus")
      .lean();

    if (!sub || String(sub.courseId) !== String(courseId)) {
      return res.status(404).json({ message: "Lesson not found." });
    }
    if (!isLessonReadyForStudents(sub.knowledgeStatus) || !sub.videoUrl) {
      return res.status(404).json({ message: "Lesson video is not available." });
    }

    if (
      durationSec >= 1 &&
      (!Number(sub.videoDurationSec) || Number(sub.videoDurationSec) <= 0)
    ) {
      await CourseSubSection.updateOne(
        { _id: sub._id, $or: [{ videoDurationSec: { $exists: false } }, { videoDurationSec: { $lte: 0 } }] },
        { $set: { videoDurationSec: durationSec } }
      );
    }

    const [videoLessons, sectionNameById] = await Promise.all([
      loadReadyVideoLessons(courseId),
      loadSectionNames(courseId),
    ]);
    const resolvedDuration = durationSec || Number(sub.videoDurationSec) || 0;

    if (!userId) {
      const lessonMap = {
        [subsectionId]: {
          durationSec: resolvedDuration,
          intervals: incomingIntervals,
          watchedSec:
            Math.round(
              Math.min(resolvedDuration || coveredSeconds(incomingIntervals), coveredSeconds(incomingIntervals)) *
                100
            ) / 100,
        },
      };
      return res.status(200).json({
        success: true,
        stored: false,
        data: buildSummary(videoLessons, lessonMap, sectionNameById),
      });
    }

    const existing = await CourseWatchProgress.findOne({ userId, courseId });
    const lessons = Array.isArray(existing?.lessons)
      ? existing.lessons.map((lesson) => ({
          subsectionId: lesson.subsectionId,
          durationSec: lesson.durationSec,
          intervals: lesson.intervals,
        }))
      : [];

    const index = lessons.findIndex(
      (lesson) => String(lesson.subsectionId) === subsectionId
    );
    const previous = index >= 0 ? lessons[index] : null;
    const mergedIntervals = normalizeIntervals(
      [...(previous?.intervals || []), ...incomingIntervals],
      resolvedDuration || MAX_VIDEO_SEC
    );
    const nextLesson = {
      subsectionId,
      durationSec: Math.max(Number(previous?.durationSec) || 0, resolvedDuration),
      intervals: mergedIntervals,
    };

    if (index >= 0) {
      lessons[index] = nextLesson;
    } else {
      lessons.push(nextLesson);
    }

    await CourseWatchProgress.findOneAndUpdate(
      { userId, courseId },
      { $set: { userId, courseId, lessons } },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      stored: true,
      data: buildSummary(
        videoLessons,
        serializeLessons(lessons),
        sectionNameById
      ),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to save watch progress." });
  }
};

module.exports = {
  getWatchProgress,
  upsertWatchProgress,
};
