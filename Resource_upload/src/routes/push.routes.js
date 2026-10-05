const express = require("express");
const ensureGatewayAccess = require("../middleware/gatewayAuth.middleware");
const verifyTeacherJwt = require("../middleware/verifyTeacherJwt.middleware");
const { getVapidKey, subscribe } = require("../controllers/push.controller");

const router = express.Router();

router.get("/push/vapid-public-key", ensureGatewayAccess, verifyTeacherJwt, getVapidKey);
router.post("/push/subscribe", ensureGatewayAccess, verifyTeacherJwt, subscribe);

module.exports = router;
