import { readFile } from "fs/promises";
import { existsSync } from "fs";
import type {
  TranscriptMessage,
  ParsedTranscript,
} from "../types/transcript.js";

export class TranscriptParser {
  /**
   * Parse a transcript JSONL file
   */
  async parseTranscript(transcriptPath: string): Promise<ParsedTranscript> {
    // Expand ~ to home directory
    const expandedPath = transcriptPath.replace(/^~/, process.env.HOME || "");

    if (!existsSync(expandedPath)) {
      throw new Error(`Transcript file not found: ${transcriptPath}`);
    }

    const content = await readFile(expandedPath, "utf-8");
    const lines = content.trim().split("\n");

    const messages: TranscriptMessage[] = lines
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));

    // Extract session metadata
    const userMessages = messages.filter((m) => m.type === "user");
    const assistantMessages = messages.filter((m) => m.type === "assistant");

    const firstUserMessage = userMessages[0];
    const firstPrompt = this.extractPromptText(firstUserMessage);
    const sessionSlug = this.deriveSessionSlug(messages, firstUserMessage);

    // Calculate duration
    const timestamps = messages
      .filter((m) => m.timestamp)
      .map((m) => new Date(m.timestamp));

    const startTime = timestamps[0] || new Date();
    const endTime = timestamps[timestamps.length - 1] || new Date();

    return {
      sessionSlug,
      firstPrompt,
      startTime,
      endTime,
      userMessageCount: userMessages.length,
      assistantMessageCount: assistantMessages.length,
      totalMessages: messages.length,
    };
  }

  /**
   * Produce a human-readable session slug. Prefers a `slug` field on the
   * first user message if present (legacy transcripts), otherwise derives
   * `<project-basename>-<uuid-prefix>` from `cwd` and `sessionId`.
   */
  private deriveSessionSlug(
    messages: TranscriptMessage[],
    firstUserMessage: TranscriptMessage | undefined,
  ): string {
    if (firstUserMessage?.slug) {
      return firstUserMessage.slug;
    }

    const cwd = firstUserMessage?.cwd ?? messages.find((m) => m.cwd)?.cwd;
    const sessionId =
      firstUserMessage?.sessionId ??
      messages.find((m) => m.sessionId)?.sessionId;

    const projectName = cwd
      ? cwd.split(/[\\/]/).filter(Boolean).pop()
      : undefined;
    const uuidPrefix = sessionId ? sessionId.slice(0, 8) : undefined;

    if (projectName && uuidPrefix) return `${projectName}-${uuidPrefix}`;
    if (projectName) return projectName;
    if (uuidPrefix) return uuidPrefix;
    return "unknown-session";
  }

  /**
   * Extract text from a user message
   */
  private extractPromptText(message: TranscriptMessage | undefined): string {
    if (!message?.message?.content) {
      return "No prompt available";
    }

    const content = message.message.content;

    // Handle string content
    if (typeof content === "string") {
      return this.truncateText(content, 100);
    }

    // Handle array content (multipart messages)
    if (Array.isArray(content)) {
      const textParts = content
        .filter((part) => part.type === "text" && part.text)
        .map((part) => part.text)
        .join(" ");

      return this.truncateText(textParts, 100);
    }

    return "No prompt available";
  }

  /**
   * Truncate text to a maximum length
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    return text.substring(0, maxLength).trim() + "...";
  }
}
