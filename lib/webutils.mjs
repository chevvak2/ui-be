'use strict';
import { logger } from "./logger.mjs";
export { sendError, sendInternalServerError, logInternalServerError, setSessionCookie };

function sendError(res, errorCode, trace) {
  logger.error(trace);
  const response = {
    'status': 'error',
    'data': trace
  }
  res.status(errorCode).json(response);
}

function sendInternalServerError(res, trace=null) {
  sendError(res, 500, trace);
}

function logInternalServerError(req, err) {
  req.log.error(`Internal Server Error: ${err}`);
}

function setSessionCookie(res, cookieConfig, cookieVal, cookiePath, maxAgeSec) {
  logger.debug(`set session cookie: [${cookieConfig.name}/${maxAgeSec}]: ${cookieVal}`);
  res.cookie(cookieConfig.name, cookieVal, {
    maxAge: maxAgeSec * 1000,
    path: cookiePath,
    httpOnly: cookieConfig.http_only,
    secure: cookieConfig.secure,
    sameSite: cookieConfig.same_site
  });
}
