import * as Fuse from 'fuse.js';
import * as functions from 'firebase-functions';
const admin = require('firebase-admin');

export class DatabaseService {
    private _db = admin.firestore();

    getDb() {
        return this._db;
    }

    getFirestoreTimestamp() {
        return this._db.FieldValue.serverTimestamp();
    }

    async getProtocolStep(stepIndex: number) {
        const currentProtocolStep = await this._db
            .collection('Protocols')
            .doc('passage')
            .collection('Steps')
            .where("index", "==", stepIndex)
            .get();

        if (currentProtocolStep.empty) {
            return "";
        } else {
            let returnStep = {} as any;
            currentProtocolStep.forEach(step => {
                returnStep.displayedText = step.data().displayedText;
                returnStep.spokenPrompt = step.data().spokenPrompt;
                returnStep.followUpAction = step.data().followUpAction;
            });
            return returnStep;
        }
    }

    async getProtocolStepsAsList() {
        let stepRecords = await this._db
            .collection('Protocols')
            .doc('passage')
            .collection('Steps')
            .get();

        stepRecords = stepRecords.docs;

        let steps = {};
        stepRecords.forEach(async (step, index) => {
            const stepData = step.data();
            steps[`STEP ${index}`] = {
                title: `Step ${index + 1}`,
                description: stepData.displayedText
            };
        });

        return steps;
    }

    async getClosestProtocolStep(query: string) {
        const stepRecords = await this._db
            .collection('Protocols')
            .doc('passage')
            .collection('Steps')
            .get();
        
        let steps = [];
        stepRecords.forEach(step => {
            steps.push(step.data());
        });

        console.log("steps count: " + steps.length);

        let options = {
            shouldSort: true,
            threshold: 0.6,
            location: 0,
            distance: 100,
            maxPatternLength: 32,
            minMatchCharLength: 1,
            keys: [
                "displayedText"
            ]
        };
        let fuse = new Fuse(steps, options);
        let result = fuse.search(query);
        console.log(result);
    }
}