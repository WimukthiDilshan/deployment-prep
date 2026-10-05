const mongoose = require("mongoose");
const {
  getVapidPublicKey,
  vapidConfigured,
  saveSubscription,
} = require("../services/pushNotification.service");

const getVapidKey = (req, res) => {
  if (!vapidConfigured()) {
    return res.status(200).json({
      success: true,
      data: { publicKey: "", configured: false },
    });
  }
  return res.status(200).json({
    success: true,
    data: { publicKey: getVapidPublicKey(), configured: true },
  });
};

const subscribe = async (req, res) => {
  const educatorId = req.user?.id ? String(req.user.id).trim() : "";
  if (!educatorId || !mongoose.Types.ObjectId.isValid(educatorId)) {
    return res.status(400).json({ message: "Invalid educator session." });
  }
  try {
    await saveSubscription(educatorId, req.body);
    return res.status(201).json({ success: true, message: "Push subscription saved." });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Failed to save push subscription.",
    });
  }
};

module.exports = { getVapidKey, subscribe };
