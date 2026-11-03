// The open chat lives in the address bar (/?bot=<id>&conversation=<id>), so reloads, the back
// button and links all reopen the same bot and conversation. No bot = Bertha.
import { useLocation, useSearch } from "wouter";
import { useCallback, useMemo } from "react";

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage: string | null;
  lastActivityAt: string;
  botId: string | null;
  botName: string | null;
  botAvatarEmoji: string | null;
  botAvatarUrl: string | null;
}

export function chatHref(botId: string | null, conversationId?: string | null) {
  const params = new URLSearchParams();
  if (botId) params.set("bot", botId);
  if (conversationId) params.set("conversation", conversationId);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function useChatNav() {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const { botId, conversationId } = useMemo(() => {
    const params = new URLSearchParams(search);
    return { botId: params.get("bot"), conversationId: params.get("conversation") };
  }, [search]);
  const onChat = location === "/";

  const open = useCallback((bot: string | null, conversation: string | null, replace = false) => {
    navigate(chatHref(bot, conversation), { replace });
  }, [navigate]);

  return { onChat, botId: onChat ? botId : null, conversationId: onChat ? conversationId : null, open };
}
