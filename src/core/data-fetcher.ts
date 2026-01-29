import { execa } from "execa";
import type { CcusageResponse, CcusageSession } from "../types/ccusage.js";

export class DataFetcher {
  /**
   * Fetch session data from ccusage CLI
   */
  async fetchSessionData(sessionId?: string): Promise<CcusageSession> {
    try {
      const args = ["session", "--json", "--breakdown"];

      if (sessionId) {
        args.push("--id", sessionId);
      }

      const { stdout } = await execa("npx", ["ccusage", ...args], {
        timeout: 30000, // 30 second timeout
      });

      const response: CcusageResponse = JSON.parse(stdout);

      if (!response.sessions || response.sessions.length === 0) {
        throw new Error("No session data found");
      }

      // If no session ID specified, find the first session with a valid project path
      if (!sessionId) {
        const validSession = response.sessions.find(
          (s) => s.projectPath && s.projectPath !== "Unknown Project",
        );

        if (!validSession) {
          throw new Error(
            "No sessions with valid project paths found. Please run this command from a SessionEnd hook.",
          );
        }

        return validSession;
      }

      // Return the first session (should match the ID if specified)
      return response.sessions[0];
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch session data: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get the most recent session ID
   */
  async getMostRecentSessionId(): Promise<string> {
    const sessionData = await this.fetchSessionData();
    return sessionData.sessionId;
  }
}
