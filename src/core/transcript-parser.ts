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
    const expandedPath = transcriptPath.replace(/^~/, process.env.HOME || process.env.USERPROFILE || "");

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
    const sessionSlug = firstUserMessage?.slug || "unknown-session";

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
