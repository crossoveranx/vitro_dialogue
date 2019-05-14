import { Conversation } from '../models';
import { DatabaseService } from './database.service';

export class LoggingService {
    private _dbService;

    constructor(dbService: DatabaseService) {
        this._dbService = dbService;
    }

    async logUtterance(conversation: Conversation) {
        if (conversation.user && conversation.user.id) {
            const db = this._dbService.getDb();

            await db.collection('utterances').add({
                userId: conversation.user.id,
                request: conversation.body,
                timestamp: this._dbService.getFirestoreTimestamp()
            });
        }
    }
}