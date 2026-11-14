// Every app question creates a fresh, server-scoped instance. Never resume a browser-selected ID.
export function freshAgentRequest(customerId: string, question: string, appContext?: string) {
  return {
    conversationId: `koti-app-${crypto.randomUUID()}`,
    options: {
      uid: null,
      initialData: { customerId, appMode: true },
      message: {
        kind: 'user' as const,
        body: appContext ? `${question}\n\n<koti_app_context>\n${appContext}\n</koti_app_context>` : question,
      },
    },
  };
}
