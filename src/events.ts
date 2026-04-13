export type OperationalEvent = {
  timestamp: string;
  type: string;
  status?: 'info' | 'success' | 'error' | 'running';
  summary: string;
  details?: string[];
  category?: 'session' | 'subagent' | 'tool' | 'streaming';
  phase?: 'start' | 'complete' | 'selected' | 'deselected' | 'info';
  toolCallId?: string;
  toolName?: string;
  agentName?: string;
  agentDisplayName?: string;
  agentDescription?: string;
  error?: string;
  // Streaming content fields (when category is 'streaming')
  deltaContent?: string;
  messageId?: string;
  parentToolCallId?: string;
};

// Streaming-specific event for incremental assistant content
export type StreamingContentEvent = {
  timestamp: string;
  type: 'assistant.message_delta';
  status: 'running';
  summary: string;
  category: 'streaming';
  deltaContent: string;
  messageId: string;
  parentToolCallId?: string;
};
