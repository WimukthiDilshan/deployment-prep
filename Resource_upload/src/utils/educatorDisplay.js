const mongoose = require("mongoose");
const Course = require("../models/course.model");

function emailLocalPart(email) {
  const s = String(email ?? "").trim();
  if (!s) return "";
  const at = s.indexOf("@");
  return at > 0 ? s.slice(0, at) : s;
}

/**
 * Display name for the logged-in educator: JWT name, then optional body field
 * (same user from the client), then email local-part from the token.
 */
function resolveEducatorNameFromRequest(req) {
  const fromJwt = String(req.user?.name ?? "").trim();
  if (fromJwt) return fromJwt;
  const fromBody = String(req.body?.educatorName ?? "").trim();
  if (fromBody) return fromBody;
  return emailLocalPart(req.user?.email);
}

/**
 * If the course has no educator label yet, set it (e.g. legacy rows or missing JWT name).
 */
async function ensureCourseEducatorName(courseId, name) {
  const label = String(name ?? "").trim();
  if (!label || !courseId) return;
  const idStr = String(courseId);
  if (!mongoose.Types.ObjectId.isValid(idStr)) return;

  await Course.updateOne(
    {
      _id: idStr,
      $or: [
        { educatorName: { $exists: false } },
        { educatorName: null },
        { educatorName: "" },
      ],
    },
    { $set: { educatorName: label } }
  );
}

module.exports = {
  resolveEducatorNameFromRequest,
  ensureCourseEducatorName,
  emailLocalPart,
};
