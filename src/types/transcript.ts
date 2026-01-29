// Transcript JSONL types

export interface TranscriptMessage {
  type: "user" | "assistant" | "file-history-snapshot";
  message?: {
    content:
      | string
      | Array<{ type: string; text?: string; [key: string]: unknown }>;
    role?: "user" | "assistant";
    model?: string;
  };
  slug?: string;
  sessionId?: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  timestamp: string;
  uuid?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export interface ParsedTranscript {
  sessionSlug: string;
  firstPrompt: string;
  startTime: Date;
  endTime: Date;
  userMessageCount: number;
  assistantMessageCount: number;
  totalMessages: number;
}
