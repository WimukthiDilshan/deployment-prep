const mongoose = require("mongoose");
const Course = require("../models/course.model");
const CourseSection = require("../models/courseSection.model");
const {
  resolveEducatorNameFromRequest,
  ensureCourseEducatorName,
} = require("../utils/educatorDisplay");

const createCourseSections = async (req, res) => {
  const { courseId } = req.params;
  const educatorId = req.user?.id ? String(req.user.id).trim() : "";

  if (!educatorId || !mongoose.Types.ObjectId.isValid(educatorId)) {
    return res.status(400).json({ message: "Invalid educator session." });
  }

  if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ message: "Invalid course id." });
  }

  const rawSections = Array.isArray(req.body.sections) ? req.body.sections : [];
  const named = rawSections
    .map((s) => (typeof s?.name === "string" ? s.name.trim() : ""))
    .filter(Boolean);

  if (named.length === 0) {
    return res.status(400).json({ message: "Add at least one section name." });
  }

  const course = await Course.findById(courseId).lean();
  if (!course) {
    return res.status(404).json({ message: "Course not found." });
  }

  if (String(course.educatorId) !== educatorId) {
    return res.status(403).json({ message: "You can only add sections to your own courses." });
  }

  try {
    const docs = named.map((sectionName, index) => ({
      courseId,
      educatorId,
      sectionName,
      order: index,
    }));

    const created = await CourseSection.insertMany(docs);

    await ensureCourseEducatorName(
      courseId,
      resolveEducatorNameFromRequest(req)
    );

    return res.status(201).json({
      success: true,
      message: "Sections saved successfully",
      data: created.map((doc) => ({
        id: doc._id,
        courseId: doc.courseId,
        sectionName: doc.sectionName,
        order: doc.order,
        createdAt: doc.createdAt,
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to save sections." });
  }
};

const createSingleSection = async (req, res) => {
  const { courseId } = req.params;
  const educatorId = req.user?.id ? String(req.user.id).trim() : "";
  const name = (req.body?.name || "").trim();

  if (!educatorId || !mongoose.Types.ObjectId.isValid(educatorId)) {
    return res.status(400).json({ message: "Invalid educator session." });
  }

  if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({ message: "Invalid course id." });
  }

  if (!name) {
    return res.status(400).json({ message: "Section name is required." });
  }

  const course = await Course.findById(courseId).lean();
  if (!course) {
    return res.status(404).json({ message: "Course not found." });
  }

  if (String(course.educatorId) !== educatorId) {
    return res.status(403).json({ message: "You can only add sections to your own courses." });
  }

  try {
    const order = await CourseSection.countDocuments({ courseId });
    const doc = await CourseSection.create({
      courseId,
      educatorId,
      sectionName: name,
      order,
    });

    await ensureCourseEducatorName(
      courseId,
      resolveEducatorNameFromRequest(req)
    );

    return res.status(201).json({
      success: true,
      message: "Section created",
      data: {
        id: doc._id,
        courseId: doc.courseId,
        sectionName: doc.sectionName,
        order: doc.order,
        createdAt: doc.createdAt,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to create section." });
  }
};

module.exports = { createCourseSections, createSingleSection };
