'use strict';

import * as arsmsg from './ARSMessages.mjs';
import * as trapi from './trapi.mjs';

/* Translate messages coming from the Translator Service into the formats that the Frontend (FE) app expects */
/* This module should not contain logic that goes beyond message transformations */
export { TranslatorServicexFEAdapter };
// msg: ARS client message with trace=y

function determineStatus(msg)
{
  if (msg.queuing)
  {
    return "running";
  }
  else
  {
    return msg.running.length > 0 ? "running" : "success";
  }
}

class TranslatorServicexFEAdapter
{
  constructor (annotationClient)
  {
    this.annotationClient = annotationClient;
  }

  querySubmitToFE(msg)
  {
    return {
      status: 'success',
      data: arsmsg.msgId(msg)
    }
  }

  queryStatusToFE(msg)
  {
    return {
      status: determineStatus(msg),
      data: {
        qid: msg.pk,
        aras: msg.completed.map(e => e.agent)
      }
    };
  }

  async queryResultsToFE(msg, maxHops)
  {
    // Omit ARA results where the actual results array is empty
    // Need to account for the ARS returning both null and []
    let mergedResult = msg.completed[0];
    if (Array.isArray(mergedResult.data.results) && mergedResult.data.results.length > 0)
    {
      mergedResult = {
        agent: mergedResult.agent,
        message: mergedResult.data
      }
    }

    return {
      status: determineStatus(msg),
      data: await trapi.creativeAnswersToSummary(msg.pk,
        [mergedResult],
        maxHops,
        this.annotationClient)
    };
  }
}

// msg: an ARS client message w/ results

// Currently the FE doesn't expect this message to be handling failure conditions
// msg: The standard ARS message returned when you post a query
