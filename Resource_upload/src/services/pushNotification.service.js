const webpush = require("web-push");
const PushSubscription = require("../models/pushSubscription.model");
const Course = require("../models/course.model");

function vapidConfigured() {
  return Boolean(
    String(process.env.VAPID_PUBLIC_KEY || "").trim() &&
      String(process.env.VAPID_PRIVATE_KEY || "").trim()
  );
}

function getVapidPublicKey() {
  return String(process.env.VAPID_PUBLIC_KEY || "").trim();
}

function configureWebPush() {
  if (!vapidConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_CONTACT || "mailto:teacher@localhost",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  return true;
}

async function saveSubscription(educatorId, subscription) {
  const endpoint = String(subscription?.endpoint || "").trim();
  const p256dh = String(subscription?.keys?.p256dh || "").trim();
  const auth = String(subscription?.keys?.auth || "").trim();
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Invalid push subscription.");
  }
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    {
      educatorId,
      endpoint,
      keys: { p256dh, auth },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function notifyEducator(educatorId, payload) {
  if (!configureWebPush()) {
    console.log("[push] VAPID keys missing; Chrome web push skipped.");
    return;
  }
  const subs = await PushSubscription.find({ educatorId });
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          body
        );
      } catch (error) {
        const status = Number(error.statusCode || 0);
        if (status === 404 || status === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
        } else {
          console.warn("[push] send failed:", error.message);
        }
      }
    })
  );
}

async function notifyLessonProcessed(doc, status) {
  if (!doc?.educatorId) return;
  let courseName = "your lesson";
  try {
    const course = await Course.findById(doc.courseId).select("courseName").lean();
    if (course?.courseName) courseName = course.courseName;
  } catch (_) {
    // keep fallback name
  }
  const ready = status === "ready" || status === "needs_rebuild";
  await notifyEducator(doc.educatorId, {
    title: ready ? "Lesson processing complete" : "Lesson processing finished with issues",
    body: ready
      ? `"${courseName}" is ready. Whisper, MiniLM, and knowledge chunk are done.`
      : `"${courseName}" finished processing, but the knowledge chunk needs a review.`,
    url: "/upload-lesson",
    knowledgeStatus: status,
    subsectionId: String(doc._id),
  });
}

module.exports = {
  vapidConfigured,
  getVapidPublicKey,
  saveSubscription,
  notifyEducator,
  notifyLessonProcessed,
};
