import {
    BasicCard,
    BasicCardOptions,
    DialogflowApp,
    SimpleResponse,
    RichResponse,
    List,
    UpdatePermission
} from 'actions-on-google';
import * as functions from 'firebase-functions';
import { DatabaseService } from './database.service';
import {
    Conversation,
    ConversationData,
    CellContexts,
    UserStorage
} from '../models';
import { DurationConverter } from './duration.converter';
import * as NodeRequest from 'request';

export class CellbotService {
    private _dbService: DatabaseService;

    constructor(dbService: DatabaseService) {
        this._dbService = dbService;
    }

    build(app) {
        // GENERAL CONVERSATION INTENTS
        app.intent('Default Welcome Intent', async (conv: Conversation) => {
            // log input for researchy goodness
            // await loggingService.logUtterance(conv);

            const greeting = "Hi, and welcome to the lab! Today, we're going to do the cell passage protocol.";
            await this.askFirstProtocolStep(conv, greeting);
        });

        app.intent('annotate.cell_appearance', (conv: Conversation) => {
            this.checkConfluency(conv, new RichResponse());
        });

        app.intent('annotate.confluency', (conv: Conversation) => {
            // find confluency percentage:
            let confluency = conv.parameters['confluency'].toString();
            if (confluency.substr(-1) !== '%') confluency += '%'; // add a % to the end of the percent string if it doesn't already exist

            conv.ask(`Okay. ${confluency} - got it! Do you want to see some images of other cells that were labeled as ${confluency} confluent?`);
        });

        app.intent('annotate.confluency - fallback', (conv: Conversation) => {
            conv.ask(`Sorry, I didn't catch that. Please state the confluency as a percentage, like 20% or 75%.`);
        });

        app.intent('annotate.confluency-followup-yes', async (conv: Conversation) => {
            let confluency = conv.parameters['confluency'].toString();
            if (confluency.substr(-1) !== '%') confluency += '%'; // add a % to the end of the percent string if it doesn't already exist
            console.log(confluency);

            // Find image(s) of cells at a given confluency:
            const confluencyInteger = parseInt(confluency.replace("%", ""));
            console.log(confluencyInteger);
            const images = await this._dbService
                .getDb()
                .collection('Images')
                .where("confluency", "==", confluencyInteger)
                .get();

            console.log(images);
            let imageUrl = "";
            images.forEach(image => {
                console.log(image.data());
                imageUrl = image.data().download_url;
            });
            console.log(imageUrl);

            const richResponse = new RichResponse();
            const card = new BasicCard({
                title: `${confluency} confluent`,
                text: 'These cells were labeled as ' + confluency + ' confluent. Let\'s keep going with the passage protocol.',
                image: {
                    url: imageUrl,
                    accessibilityText: 'cells at ' + confluency + ' confluency',
                },
                display: 'CROPPED'
            });

            richResponse
                .add(`Ok, here are some cells at ${confluency} confluency.`)
                .add(card);

            conv.contexts.set('protocol-passage', 5);
            await this.getNextProtocolStep(conv, richResponse);
        });

        app.intent('annotate.confluency-followup-no', async (conv: Conversation) => {
            conv.contexts.set('protocol-passage', 5);            
            await this.getNextProtocolStep(conv, new RichResponse(`Ok, let's keep going with the passage protocol, then.`));
        });

        // app.intent('protocol.resolve', async (conv: Conversation) => {
        //     console.log(conv);
        //     const protocolName = conv.query;
        //     conv.contexts.set('protocol-passage', 5);
        //     conv.followup(`PROTOCOL_START_PASSAGE`, { protocolName: protocolName });
        // });

        app.intent('protocol.passage', async (conv: Conversation) => {
            this.askFirstProtocolStep(conv);
        });

        app.intent('annotate.action', async (conv: Conversation) => {
            const firstStep = await this._dbService.getProtocolStep(0);
            const protocolName = conv.parameters['cellActions'].toString();
            const responseText = `<speak>You said ${protocolName}. Cool! Let's start the ${protocolName} protocol. <break time="2s"/> Your first step is to ${firstStep}.</speak>`;

            const richResponse = new RichResponse();
            richResponse
                .add(responseText)
                .add(new BasicCard({
                    title: "Step 1",
                    text: firstStep
                }));

            conv.data.currentProtocolStep = 1;

            conv.contexts.set(`protocol-${protocolName}`, 5);
            conv.ask(richResponse);
        });

        app.intent('skip-to.protocol.step.number', async (conv: Conversation) => {
            let stepNum = parseInt(conv.parameters['number'].toString());
            await this.skipToProtocolStep(conv, stepNum);
        });

        app.intent("seach.protocol.steps", async (conv: Conversation) => {
            // await this._dbService.getClosestProtocolStep("I just took my cells out of the incubator");
        });

        app.intent('skip-to.annotate.action', (conv: Conversation) => {
            conv.followup('ANNOTATE_ACTION', {cellActions: 'passage'});
        });

        app.intent('protocol.passage - repeat', (conv: Conversation) => {
            conv.followup('repeat');
        });

        app.intent('Default Fallback Intent', async (conv: Conversation) => {
            // const protocolList = await this.getProtocolAsList(conv);
            conv.ask(`Sorry, I didn't understand. Last I could tell, you were on step ${conv.data.currentProtocolStep + 1} of the protocol. Here's a full list. You can tap on any step to jump to that point in the protocol.`);
            // conv.ask(protocolList);
        });

        // Jump to step in protocol
        app.intent('handle.protocol.select', async (conv, params, option) => {
            if (option) {
                // Parse the option to get the step index:
                console.log(option);
                let stepNum = parseInt(option.match(/\d+/)[0]);
                await this.skipToProtocolStep(conv, stepNum);
            } else {
                conv.ask('You did not select any item');
            }
        });

        app.intent('protocol.passage - previous', async (conv: Conversation) => {
            if (conv.data.currentProtocolStep === 0) {
                conv.ask("You're already at the beginning of the protocol.");
                return;
            }

            // update the user's current protocol step and get its data
            conv.data.currentProtocolStep--;
            const protocolStep = await this._dbService.getProtocolStep(conv.data.currentProtocolStep);
            const richResponse = new RichResponse();
            richResponse
                .add(new SimpleResponse({
                    speech: "<speak>" + protocolStep.spokenPrompt + "</speak>",
                    text: protocolStep.displayedText,
                }))
                .add(new BasicCard({
                    text: protocolStep.displayedText,
                    title: `Step ${conv.data.currentProtocolStep + 1}`
                }));

            conv.ask(richResponse);
        });

        app.intent('protocol.passage - next', async (conv: Conversation) => {
            await this.getNextProtocolStep(conv);
        });

        // UTILITY RESPONSES
        app.intent('timer.push.start', async (conv: Conversation) => {
            const durationConverter = new DurationConverter();
            const timerDuration: { amount: number, unit: string } = <{ amount: number, unit: string }>conv.parameters['duration'];
            const durationInMillis = durationConverter.convert(timerDuration);

            this.setTimerWithDuration(conv, durationInMillis, `Your timer for ${timerDuration.amount} ${timerDuration.unit} is finished!`);

            conv.ask(`Cool! I set your timer for ${timerDuration.amount} ${timerDuration.unit}. What's next?`);
        });

        // TIMER ENABLING
        app.intent('timer.push.setup', (conv: Conversation) => {
            conv.contexts.set('timerPushSetupFinalize', 1);
            conv.ask(new UpdatePermission({ intent: 'timer.push.elapsed' }));
        });

        app.intent('timer.push.setup.finalize', conv => {
            if (conv.arguments.get('PERMISSION')) {
                const userID = conv.user.id;
                console.log('user enabled', conv.user.id)
                // TODO: code to save intent and userID in our db so we only have to ask them once
                conv.ask(`Okay! Now if you set a timer, I can send you a push notification when it's up. What's next?`);
            }
            else {
                conv.ask(`Okay, no problem. I won't be able to set timers for you, but we can still have fun culturing cells together! What's next?`);
            }
        });

        // PAUSE AND RESUME
        app.intent('pause', (conv: Conversation) => {
            conv.ask(`No problem. Just say 'OK Vitro' to get my attention again.`);
        });

        app.intent('resume', async (conv: Conversation) => {
            const currentProtocolStep = conv.data.currentProtocolStep;
            conv.data.currentProtocolStep--; // decrement so it essentially repeats the current step when "getNext" is called
            await this.getNextProtocolStep(conv, new RichResponse(`I'm listening! We left off at Step ${currentProtocolStep}.`));
        });

        return app;
    }


    private async askFirstProtocolStep(conv: Conversation, preface?: string) {
        const simpleResponse = new SimpleResponse({
            speech: preface,
            text: preface,
        });

        const firstStep = await this._dbService.getProtocolStep(0);

        console.log(firstStep);
        const responseText = `<speak>${firstStep.spokenPrompt}.</speak>`;

        const richResponse = new RichResponse();
        if (preface) {
            richResponse.add(simpleResponse);
        }

        richResponse
            .add(responseText)
            .add(new BasicCard({
                title: "Step 1",
                text: firstStep.displayedText
            }));

        conv.data.currentProtocolStep = 0;
        conv.contexts.set('protocol-passage', 5);

        conv.ask(richResponse);
    }

    private checkConfluency(conv: Conversation, response: RichResponse) {
        conv.contexts.set('confluency', 1);
        response.add(`What do you think the confluency of the cells is?`);
        conv.ask(response);
    }

    private placeCellsInIncubator(conv: Conversation, response: RichResponse) {
        // Cells should stay in the incubator for 5 min = 300000 milliseconds
        let currentDateTime = new Date();
        currentDateTime.setTime(currentDateTime.getTime() + 300000);
        const readableTimerCompletionDateTime = currentDateTime.toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
        this.setTimerWithDuration(conv, 300000, `Take your cells out of the incubator as of ${readableTimerCompletionDateTime}`);
        response.add(`I'll set a timer for 5 minutes now, and will let you know when time's up! It will finish at ${readableTimerCompletionDateTime}.`);
        conv.ask(response);
    }

    private placeCellsInCentrifuge(conv: Conversation, response: RichResponse) {
        // Cells should be in the centrifuge for 10 min = 600000 milliseconds
        let currentDateTime = new Date();
        currentDateTime.setTime(currentDateTime.getTime() + 600000);
        const readableTimerCompletionDateTime = currentDateTime.toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
        this.setTimerWithDuration(conv, 600000, `Take your cells out of the centrifuge as of ${readableTimerCompletionDateTime}`);
        response.add(`I'll set a timer for 10 minutes just in case, but the centrifuge will also shut off on its own. It should finish around ${readableTimerCompletionDateTime}.`);
        conv.ask(response);
    }

    private async skipToProtocolStep(conv: Conversation, stepNum: number) {
        conv.contexts.set('protocol-passage', 5);
        conv.contexts.set('conversation', 5);
        conv.data.currentProtocolStep = (stepNum - 2);
        await this.getNextProtocolStep(conv);
    }

    private async getNextProtocolStep(conv: Conversation, response?: RichResponse) {
        console.log('next');
        // update the user's current protocol text and get its data
        conv.data.currentProtocolStep++;
        const currentProtocolStep = conv.data.currentProtocolStep;
        console.log(currentProtocolStep);
        const protocolStep = await this._dbService.getProtocolStep(currentProtocolStep);

        if (!protocolStep) {
            conv.ask("That's all, folks! Looks like you've reached the end of the protocol.");
            return;
        }

        const richResponse = response || new RichResponse();
        richResponse
            .add(new SimpleResponse({
                speech: "<speak>" + protocolStep.spokenPrompt + "</speak>",
                text: protocolStep.displayedText,
            }))
            .add(new BasicCard({
                text: protocolStep.displayedText,
                title: `Step ${conv.data.currentProtocolStep + 1}`
            }));

        if (protocolStep.followUpAction) {
            this[protocolStep.followUpAction](conv, richResponse);
        } else {
            conv.ask(richResponse);
        }
    }

    private async getProtocolAsList(conv: Conversation) {
        const protocolItems = await this._dbService.getProtocolStepsAsList();
        const protocolList = new List({
            title: 'Passage Protocol',
            items: protocolItems
        });
        return protocolList;
    }

    private async setTimerWithDuration(conv: Conversation, duration: number, notification: string) {
        console.log('sending', duration, duration, conv.user.id);

        const bodyData = {
            duration: duration,
            pushTitle: notification,
            userId: conv.user.id
        };

        // TODO: need to a switch to a version of request that supports promises for accurate handling
        const timersApiUrl = functions.config().timers.url;
        console.log('timer api', timersApiUrl);
        if (!timersApiUrl) {
            console.error("Whoops! I couldn't find the url for the timers API. Set the timers.url config value in firebase functions.");
            return;
        }

        const timerApiResponse = NodeRequest.post({ url: timersApiUrl, json: true, body: bodyData }, (error, apiResponse, body) => {
            if (error) {
                conv.ask("Whuh-oh. It sounds like the timer service isn't listening. Sorry! I'll notify the appropriate software nerds.");
                return;
            }
        });
    }
}