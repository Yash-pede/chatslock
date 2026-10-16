import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_CHAT_KEY = "chatslock.pendingChatId";

/**
 * Remembers the chat id from an incoming deep link (chatslock.com/u/<id>) so
 * it survives the redirect into auth and gets picked up once the user is in.
 */
export async function rememberPendingChatId(chatId: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_CHAT_KEY, chatId);
}

/** Reads the pending chat id and clears it (single use). */
export async function takePendingChatId(): Promise<string | null> {
  const chatId = await AsyncStorage.getItem(PENDING_CHAT_KEY);

  if (chatId) {
    await AsyncStorage.removeItem(PENDING_CHAT_KEY);
  }

  return chatId;
}
