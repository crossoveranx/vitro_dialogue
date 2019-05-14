import {
    Context,
    Contexts,
    dialogflow,
    Parameters,
    DialogflowConversation,
    DialogflowApp
} from 'actions-on-google';

class ConversationData {
    public currentProtocolStep: number;
}
class UserStorage { }
class CellContexts implements Contexts {
    [context: string]: Context<Parameters>;
}
class Conversation extends DialogflowConversation<ConversationData, UserStorage, CellContexts> { }

export { Conversation, ConversationData, UserStorage, CellContexts };