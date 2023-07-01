'use strict'

import { default as path } from 'node:path';
import { default as url } from 'node:url';
import { default as express } from 'express';
import { default as pinoHttp } from 'pino-http';
import { default as cookieParser } from 'cookie-parser';

import * as cmn from './common.mjs';

export function startServer(config, translatorService, authService)
{
  console.log(config);
  const demopath = config.demosite_path;
  const mainpath = config.mainsite_path;
  const __root = path.dirname(url.fileURLToPath(import.meta.url));
  const app = express();
  app.use(pinoHttp());
  app.use(express.json());
  app.use(cookieParser());


  app.use(express.static('./build'));
  const filters = {whitelistRx: /^ara-/}; // TODO: move to config

  app.all('/demo/*', validateUnauthSession(config, authService));
  app.all('/main/*', validateAuthSession(config, authService));

  app.post(['/creative_query', '/api/creative_query',
            `${demopath}/api/creative_query`, `${mainpath}/api/creative_query`],
           logQuerySubmissionRequest,
           validateQuerySubmissionRequest,
           handleQuerySubmissionRequest(config, translatorService));

  app.post(['/creative_status', '/api/creative_status',
            `${demopath}/api/creative_status`, `${mainpath}/api/creative_status`],
           validateQueryResultRequest,
           handleStatusRequest(config, translatorService, filters));

  app.post(['/creative_result', '/api/creative_result',
            `${demopath}/api/creative_result`, `${mainpath}/api/creative_result`],
           validateQueryResultRequest,
           handleResultRequest(config, translatorService, filters));

  app.get(['/config', '/admin/config',
           `${demopath}/admin/config`, `${mainpath}/admin/config`],
          handleConfigRequest(config));

  app.get('/oauth2/redir/:provider', handleLogin(config, authService));


  app.get(['/login'], function (req, res, next) {
    res.sendFile(path.join(__root, 'build', 'login.html'));
  });

  app.get([`${demopath}/dummypage.html`, `${mainpath}/dummypage.html`],
    function (req, res, next) {
      res.sendFile(path.join(__root, 'build', 'dummypage.html'));
  });

  app.get([`${demopath}/dm2.html`, `${mainpath}/dm2.html`],
    function (req, res, next) {
      res.sendFile(path.join(__root, 'build', 'dm2.html'));
  });

  app.get('*', (req, res, next) =>
    {
      res.sendFile(path.join(__root, 'build/index.html'));
    });

  app.listen(8386);
}

function handleLogin(config, authService) {
  return async function(req, res, next) {
    const provider = req.params.provider;
    const authcode = req.query.code;
    let newSession = await authService.handleSSORedirect(provider, authcode, config);
    if (!newSession) {
      return res.status(403).send("There was an error with your login. Please try again with a different account or contact the UI team");
    } else {
      let cookieName = config.session_cookie_name;
      let cookiePath = config.mainsite_path;
      let cookieMaxAge = authService.sessionAbsoluteTTLSec;
      setSessionCookie(res, cookieName, newSession.token, cookiePath, cookieMaxAge);
      return res.redirect(302, `${config.mainsite_path}/dummypage.html`);
    }
  }
}
function setSessionCookie(res, cookieName, cookieVal, cookiePath, maxAgeSec) {
  console.log(`_+_+_+_+_ set session cookie: [${cookieName}/${maxAgeSec}]: ${cookieVal}`);
  res.cookie(cookieName, cookieVal, {
    maxAge: maxAgeSec * 1000,
    path: cookiePath,
    httpOnly: true,
    secure: true,
    sameSite: 'Lax'
  });
}

function validateAuthSession(config, authService) {
  return async function(req, res, next) {
    let cookieName = config.session_cookie_name;
    let cookiePath = config.mainsite_path;
    let cookieToken = req.cookies[cookieName];
    let cookieMaxAge = authService.sessionAbsoluteTTLSec;

    if (!cookieToken || !authService.isTokenSyntacticallyValid(cookieToken)) {
      console.error(`%% %% %% no cookie found`);
      return res.redirect(302, `/login`);
    }
    console.error(`%% %% %% we get cookie: ${cookieToken}`);

    let session = await authService.retrieveSessionByToken(cookieToken);
    console.error(`%% %% %% we get session: ${JSON.stringify(session)}`);
    if (!session) {
      console.error(`%% %% %% no session found for ${cookieToken}`);
      return res.redirect(302, `/login`);
    }
    if (!session.user_id || session.force_kill) {
      console.error(`%% %% %% no user found for ${JSON.stringify(session)} or else force killed`);
      return res.redirect(302, `/login`);
    }
    const user = await authService.getUserById(session.user_id);
    if (!user) {
      // tricky - what if this is new user? Guess we need to ensure user creation has already happened
      console.error(`%% %% %% no user found`);
      return res.redirect(302, `/login`);
    } else if (user.deleted) {
      console.error(`%% %% %% User deleted`);
      return res.status(403).send('This account has been deactivated. Please re-register to use the site');
    } else if (authService.isSessionExpired(session)) {
      console.error(`%% %% %% Session expired: ${JSON.stringify(session)}`);
      return res.redirect(302, `/login`);
    } else if (authService.isTokenExpired(session)) {
      console.error(`%% %% %% Token expired, refreshing: ${JSON.stringify(session)}`);
      session = await authService.refreshSessionToken(session);
      setSessionCookie(res, cookieName, session.token, cookiePath, cookieMaxAge);
    } else {
      // Valid session - update time
      console.error(`%% %% %% session good, udpating time: ${JSON.stringify(session)}`);
      session = await authService.updateSessionTime(session);
    }
    next();
  }
}
function validateUnauthSession(config, authService) {
  return async function (req, res, next) {
    let session = null;
    let cookieName = config.session_cookie_name;
    let cookiePath = config.demosite_path;
    let cookieToken = req.cookies[cookieName];
    let cookieMaxAge = authService.sessionAbsoluteTTLSec;

    console.log(`-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-==- ${cookieToken}`);
    try {
      if (!authService.isTokenSyntacticallyValid(cookieToken)) {
        console.log(">>> >>> >>> did not recv a valid token; creating a new session");
        session = await authService.createNewUnauthSession();
        setSessionCookie(res, cookieName, session.token, cookiePath, cookieMaxAge);
      } else {
        session = await authService.retrieveSessionByToken(cookieToken);
        if (!session || authService.isSessionExpired(session)) {
          console.log(">>> >>> >>> Sess expired or could not retrieve; creating a new session");
          session = await authService.createNewUnauthSession();
          setSessionCookie(res, cookieName, session.token, cookiePath, cookieMaxAge);
        } else if (authService.isTokenExpired(session)) {
          // Order matters; check session expiry before checking token expiry
          console.log(">>> >>> >>> Token expired; creating a new TOKEN");
          session = await authService.refreshSessionToken(session);
          setSessionCookie(res, cookieName, session.token, cookiePath, cookieMaxAge);
        } else {
          // we have a valid existing session
          console.log(">>> >>> >>> Session was valid; updating time");
          session = await authService.updateSessionTime(session);
        }
        console.log(`>>> >>> >>> sessionData: ${JSON.stringify(session)}`);
      }
    } catch (err) {
      logInternalServerError(`Auth validation error: ${err}`);
      sendInternalServerError(`Auth validation error: ${err}`);
    }
    next();
  }
}

function logQuerySubmissionRequest(req, res, next)
{
  req.log.info({reqBody: req.body});
  next();
}

function validateQuerySubmissionRequest(req, res, next)
{
  let query = req.body;
  if (cmn.isObj(query))
  {
    next();
  }
  else
  {
    sendError(res, 400, "No disease specificed in request");
  }
}

function handleQuerySubmissionRequest(config, service)
{
  return async function(req, res, next)
  {
    try
    {
      let query = service.inputToQuery(req.body);
      req.log.info({query: query});
      let resp = await service.submitQuery(query);
      req.log.info({arsqueryresp: resp});
      res.status(200).json(service.outputAdapter.querySubmitToFE(resp));
    }
    catch (err)
    {
      logInternalServerError(req, err);
      sendInternalServerError(res);
    }
  }
}

function validateQueryResultRequest(req, res, next)
{
  let requestObj = req.body;
  if (cmn.isObj(requestObj)
    && requestObj.hasOwnProperty('qid')
    && requestObj.qid.length > 0)
  {
    next();
  }
  else
  {
    sendError(res, 400, "No query id specificed in request");
  }
}

function handleStatusRequest(config, service, filters)
{
  return async function(req, res, next)
  {
    try
    {
      let uuid = req.body.qid;
      let statusRes = await service.getQueryStatus(uuid, filters);
      res.status(200).json(service.outputAdapter.queryStatusToFE(statusRes));
    }
    catch (err)
    {
      logInternalServerError(req, err);
      sendInternalServerError(res);
    }
  }
}

function handleResultRequest(config, service, filters)
{
  return async function(req, res, next)
  {
    try
    {
      let uuid = req.body.qid;
      let svcRes = await service.getResults(uuid, filters);
      let retval = await service.outputAdapter.queryResultsToFE(svcRes,
        config.max_hops,
        config.ara_to_infores_map);
      res.status(200).json(retval);
    }
    catch (err)
    {
      logInternalServerError(req, err);
      sendInternalServerError(res);
    }
  }
}

function handleConfigRequest(config)
{
  return async function(req, res)
  {
    res.status(200).json(config.frontend);
  }
}

function sendError(res, errorCode, message)
{
  const response = {
    'status': 'error',
    'data': message
  }

  res.status(errorCode).json(response);
}

function sendInternalServerError(res)
{
  sendError(res, 500, 'Internal Server Error');
}

function logInternalServerError(req, err)
{
  req.log.error(`Internal Server Error: ${err}`);
}
