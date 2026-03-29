export type OperationalEvent = {
  timestamp: string;
  type: string;
  status?: 'info' | 'success' | 'error' | 'running';
  summary: string;
  details?: string[];
  category?: 'session' | 'subagent' | 'tool';
  phase?: 'start' | 'complete' | 'selected' | 'deselected' | 'info';
  toolCallId?: string;
  toolName?: string;
  agentName?: string;
  agentDisplayName?: string;
  agentDescription?: string;
  error?: string;
};
