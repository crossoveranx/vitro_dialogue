import { DialogflowApp, DialogflowConversation } from 'actions-on-google';

export class SurfacesService {
    private _conversation: DialogflowConversation;

    constructor(conversation: DialogflowConversation) {
        this._conversation = conversation;
    }

    getHasAudioOut() {
        return this._conversation.surface.capabilities.has('actions.capability.AUDIO_OUTPUT');
    }

    getHasScreen() {
        return this._conversation.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');
    }

    getHasMediaResponseAudio() {
        return this._conversation.surface.capabilities.has('actions.capability.MEDIA_RESPONSE_AUDIO');
    }

    getHasBrowser() {
        return this._conversation.surface.capabilities.has('actions.capability.WEB_BROWSER');
    }
}