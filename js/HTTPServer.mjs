'use strict'

import { default as path } from 'node:path';
import { default as url } from 'node:url';
import { default as express } from 'express';
import { default as pino, pinoHttp } from 'pino-http';
import * as cmn from './common.mjs';
import * as tsa from './TranslatorServicexFEAdapter.mjs';

export function startServer(config, service) {
    console.log(config);
    const __root = path.dirname(url.fileURLToPath(import.meta.url));
    const app = express();
    app.use(pinoHttp());
    app.use(express.json());
    app.use(express.static('../build'));
    const filters = {whitelistRx: /^ara-/};

    app.post('/creative_query',
        logQuerySubmissionRequest,
        validateQuerySubmissionRequest,
        handleQuerySubmissionRequest(config, service)
    );

    app.post('/creative_status',
        validateQueryResultRequest,
        handleStatusRequest(config, service, filters)
    );

    app.post('/creative_result',
        validateQueryResultRequest,
        handleResultRequest(config, service, filters)
    );
    app.listen(8386);
}

function logQuerySubmissionRequest(req, res, next) { req.log.info({reqBody: req.body}); next(); }
function validateQuerySubmissionRequest(req, res, next) {
    let query = req.body;
    if (typeof query === 'object'
        && query.hasOwnProperty('disease')
        && query.disease.length > 0) {
            next();
    } else {
        res.status(400).send("No disease specified in in request");
    }
}
function handleQuerySubmissionRequest(config, service) {
    return async function(req, res, next) {
        try {
            let query = service.inputToQuery(req.body);
            req.log.info({query: query});
            let resp = await service.submitQuery(query);
            req.log.info({arsqueryresp: resp});
            res.status(200).json(tsa.querySubmitToFE(resp));
        } catch (err) {
            req.log.error(`Internal Server Error: ${err}`);
            res.status(500).send("Internal Server Error");
        }
    }
}

function validateQueryResultRequest(req, res, next) {
    let requestObj = req.body;
    if (typeof requestObj === 'object'
        && requestObj.hasOwnProperty('qid')
        && requestObj.qid.length > 0) {
            next();
    } else {
        res.status(400).send("No query id specified in request");
    }
}
function handleStatusRequest(config, service, filters) {
    return async function(req, res, next) {
        try {
            let uuid = req.body.qid;
            let svcRes = await service.getQueryStatus(uuid, filters);
            res.status(200).json(tsa.queryStatusToFE(svcRes));
        } catch (err) {
            req.log.error(`Internal Server Error: ${err}`);
            res.status(500).send("Internal Server Error");
        }
    }
}

function handleResultRequest(config, service, filters) {
    return async function(req, res, next) {
        try {
            let uuid = req.body.qid;
            console.log(`uuid: ${uuid}`);
            let svcRes = await service.getResults(uuid, filters);
            console.log(`svcres: ${svcRes}`);
            let retval = tsa.queryResultsToFE(svcRes);
            console.log(`retval: ${retval}`);
            res.status(200).json(tsa.queryResultsToFE(svcRes));
        } catch (err) {
            req.log.error(`Internal Server Error: ${err}`);
            res.status(500).send("Internal Server Error");
        }
    }
}
