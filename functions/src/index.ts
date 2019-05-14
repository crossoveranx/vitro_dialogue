const admin = require('firebase-admin');
import * as functions from 'firebase-functions';
import * as https from 'https';
import { dialogflow } from 'actions-on-google';
import { DurationConverter } from './services/duration.converter';
import {
    Conversation,
    ConversationData,
    CellContexts,
    UserStorage
} from './models';
import { CellbotService } from './services/cellbot.service';
import { LoggingService } from './services/logging.service';
import { DatabaseService } from './services/database.service';

process.env.DEBUG = 'actions-on-google:*';

// start firebase services
admin.initializeApp(functions.config().firebase);

// these are services that'll be used throughout the request depending on the intent invoked
const dbService = new DatabaseService();
const loggingService = new LoggingService(dbService);
const botService = new CellbotService(dbService);
const app = botService.build(dialogflow<ConversationData, UserStorage, CellContexts, Conversation>());

function logRequest(request, response) {
    console.log(`New request from session: ${request.body.sessionId}`);

    // Log Dialogflow request
    const payloadForLog = request.body;
    payloadForLog.timestamp = admin.firestore.FieldValue.serverTimestamp();
    // db.collection('Log').doc().set(payloadForLog, {merge: true});

    // TODO: need to figure out how to get to intent and that kind of data under the new world order
}

exports.cellbot = functions.https.onRequest((request, response) => {
    logRequest(request, response);
    app(request, response);
});