import type { ChatMessage } from "@/components/messages/types";

const ME = "me";
const PEER = "peer";
const MINUTE = 60_000;

const TODAY = (() => {
    const date = new Date();
    date.setHours(9, 0, 0, 0);
    return date.getTime();
})();

const at = (minute: number) => TODAY + minute * MINUTE;

function message(
    input: Omit<ChatMessage, "conversationId" | "senderId" | "isMine"> & { mine: boolean },
): ChatMessage {
    const {mine, ...rest} = input;
    return {
        conversationId: "demo#me#peer",
        senderId: mine ? ME : PEER,
        isMine: mine,
        ...rest,
    };
}

/**
 * Static conversation used to build and tune the message UI. Deliberately mixes
 * text lengths, multi-paragraph text, images, a file and a voice note so the
 * list layout and scroll behaviour are exercised before the API is wired up.
 */
export const DUMMY_MESSAGES: ChatMessage[] = [
    message({
        id: "m1",
        mine: false,
        kind: "text",
        text: "Hey! Is this the Chatslock support chat?",
        createdAt: at(0),
        isSystem: true,
    }),
    message({
        id: "m2",
        mine: false,
        kind: "text",
        text: "Hi 👋 yes, this is support. How can I help you today?",
        createdAt: at(0.4),
    }),
    message({
        id: "m3",
        mine: true,
        kind: "text",
        text: "I can't see my last conversation after reinstalling the app.",
        createdAt: at(1),
        status: "read",
    }),
    message({
        id: "m4",
        mine: false,
        kind: "text",
        text: "No problem. Could you send me a screenshot of the chats list? That helps me check whether the conversations are loading at all.",
        createdAt: at(1.6),
    }),
    message({
        id: "m5",
        mine: true,
        kind: "image",
        text: "Here it is",
        image: {
            url: "https://i.pravatar.cc/600?img=14",
            width: 600,
            height: 600,
        },
        createdAt: at(2.2),
        status: "delivered",
    }),
    message({
        id: "m6",
        mine: false,
        kind: "text",
        text: "Thanks! I can see the list loads but one entry is missing. Let me check your account on the backend while you keep the app open.",
        createdAt: at(3),
    }),
    message({
        id: "m7",
        mine: false,
        kind: "voice",
        voice: {durationSeconds: 14, waveform: [3, 6, 2, 8, 5, 9, 4, 7, 3, 6, 8, 2, 5, 9, 4, 6, 3, 7, 5, 2]},
        createdAt: at(3.4),
    }),
    message({
        id: "m8",
        mine: true,
        kind: "text",
        text: "Sure, still open. Also attaching the error log just in case —\n\nSomething went wrong while fetching /conversations/chat (500). Retried twice.",
        createdAt: at(4.1),
        status: "sent",
    }),
    message({
        id: "m9",
        mine: true,
        kind: "file",
        attachment: {
            id: "a1",
            fileName: "chatslock-error-log.txt",
            mimeType: "text/plain",
            sizeBytes: 18_432,
        },
        createdAt: at(4.2),
        status: "sent",
    }),
    message({
        id: "m10",
        mine: false,
        kind: "text",
        text: "Got it, thanks. The conversation is there — it was archived by mistake. I've restored it, please pull to refresh.",
        createdAt: at(6.5),
    }),
    message({
        id: "m11",
        mine: true,
        kind: "text",
        text: "It's back 🎉 thank you so much!",
        createdAt: at(7.2),
        status: "read",
    }),
    message({
        id: "m12",
        mine: false,
        kind: "text",
        text: "Anytime. Anything else before I close this chat?",
        createdAt: at(7.6),
    }),
    message({
        id: "m13",
        mine: true,
        kind: "text",
        text: "No, that's all. Have a great day!",
        createdAt: at(8),
        status: "delivered",
    }),
];
