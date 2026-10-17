import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_AGENT_KEY = "chatslock.pendingAgentId";

/**
 * Remembers the agent id from an incoming deep link (chatslock.com/u/<agentId>)
 * so it survives the redirect into auth and can be attached at onboarding.
 */
export async function rememberPendingAgentId(agentId: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_AGENT_KEY, agentId);
}

/** Reads the pending agent id without clearing it. */
export async function getPendingAgentId(): Promise<string | null> {
  return AsyncStorage.getItem(PENDING_AGENT_KEY);
}

/** Clears the pending agent id once it has been consumed. */
export async function clearPendingAgentId(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_AGENT_KEY);
}
