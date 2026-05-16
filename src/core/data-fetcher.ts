import { execa } from "execa";
import { readdir, stat } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import type {
  CcusageResponse,
  CcusageSession,
  ModelBreakdown,
} from "../types/ccusage.js";

interface CcusageEntry {
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  model: string;
  costUSD: number;
}

interface CcusageByIdResponse {
  sessionId: string;
  totalCost: number;
  totalTokens: number;
  entries: CcusageEntry[];
}

export class DataFetcher {
  /**
   * Fetch accurate session data by exact session ID.
   * Uses `ccusage session --id` which returns the true total cost
   * (unlike --breakdown which splits into sub-session slices).
   */
  async fetchSessionById(sessionId: string): Promise<CcusageSession> {
    const { stdout } = await execa(
      "npx",
      ["ccusage", "session", "--id", sessionId, "--json"],
      { timeout: 30000 },
    );

    const data: CcusageByIdResponse = JSON.parse(stdout);

    // Aggregate entries by model
    const modelMap = new Map<
      string,
      {
        inputTokens: number;
        outputTokens: number;
        cacheCreationTokens: number;
        cacheReadTokens: number;
        totalTokens: number;
      }
    >();

    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheCreation = 0;
    let totalCacheRead = 0;

    for (const entry of data.entries) {
      // Skip synthetic entries (no real model)
      if (entry.model === "<synthetic>") continue;

      const input = entry.inputTokens || 0;
      const output = entry.outputTokens || 0;
      const cacheCreation = entry.cacheCreationTokens || 0;
      const cacheRead = entry.cacheReadTokens || 0;

      totalInput += input;
      totalOutput += output;
      totalCacheCreation += cacheCreation;
      totalCacheRead += cacheRead;

      const existing = modelMap.get(entry.model) || {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
      };

      existing.inputTokens += input;
      existing.outputTokens += output;
      existing.cacheCreationTokens += cacheCreation;
      existing.cacheReadTokens += cacheRead;
      existing.totalTokens += input + output + cacheCreation + cacheRead;
      modelMap.set(entry.model, existing);
    }

    // Distribute totalCost across models proportionally by token count
    const totalTokensAcrossModels = [...modelMap.values()].reduce(
      (sum, m) => sum + m.totalTokens,
      0,
    );

    const modelBreakdowns: ModelBreakdown[] = [...modelMap.entries()].map(
      ([modelName, stats]) => ({
        modelName,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        cacheCreationTokens: stats.cacheCreationTokens,
        cacheReadTokens: stats.cacheReadTokens,
        cost:
          totalTokensAcrossModels > 0
            ? data.totalCost * (stats.totalTokens / totalTokensAcrossModels)
            : 0,
      }),
    );

    return {
      sessionId: data.sessionId,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheCreationTokens: totalCacheCreation,
      cacheReadTokens: totalCacheRead,
      totalTokens: data.totalTokens,
      totalCost: data.totalCost,
      modelsUsed: [...modelMap.keys()],
      modelBreakdowns,
    };
  }

  /**
   * Discover a session from the ccusage breakdown list, then fetch accurate
   * data via --id.
   *
   * @param sessionQuery Optional filter — matches against:
   *   1. Project path UUID (or prefix, e.g. "5ede5ccb")
   *   2. Exact session ID (e.g. ccusage's `sessionId` field)
   *   If omitted, returns the first session with a valid project path.
   */
  async fetchSessionData(sessionQuery?: string): Promise<CcusageSession> {
    try {
      const args = ["session", "--json", "--breakdown"];

      const { stdout } = await execa("npx", ["ccusage", ...args], {
        timeout: 30000,
      });

      const response: CcusageResponse = JSON.parse(stdout);

      if (!response.sessions || response.sessions.length === 0) {
        throw new Error("No session data found");
      }

      const validSessions = response.sessions.filter(
        (s) => s.projectPath && s.projectPath !== "Unknown Project",
      );

      // ccusage 18.x reports `projectPath: "Unknown Project"` for every
      // entry and aggregates per-project rather than per-session. Fall back
      // to scanning ~/.claude/projects/ directly to locate the most recent
      // transcript and fetch its accurate totals via --id.
      if (validSessions.length === 0) {
        return await this.findSessionViaFilesystem(sessionQuery);
      }

      let match: CcusageSession | undefined;

      if (!sessionQuery) {
        match = validSessions[0];
      } else {
        // Try matching by project path UUID (exact or prefix)
        match = validSessions.find((s) => {
          const uuid = s.projectPath!.split("/").pop() || "";
          return uuid === sessionQuery || uuid.startsWith(sessionQuery);
        });

        // Try matching by session name (returns first/most recent match)
        if (!match) {
          match = validSessions.find((s) => s.sessionId === sessionQuery);
        }
      }

      if (!match) {
        const available = validSessions
          .slice(0, 10)
          .map((s) => {
            const uuid = s.projectPath!.split("/").pop() || "";
            const short = uuid.slice(0, 8);
            return `  ${short}  ${s.sessionId.padEnd(20)}  $${s.totalCost.toFixed(2)}`;
          })
          .join("\n");

        throw new Error(
          `No session matching "${sessionQuery}". Available sessions:\n${available}`,
        );
      }

      // Extract the full UUID from the projectPath and re-fetch via --id
      // for accurate totals (--breakdown only shows sub-session slices)
      const fullUuid = match.projectPath!.split("/").pop();
      if (fullUuid) {
        try {
          const accurate = await this.fetchSessionById(fullUuid);
          // Preserve projectPath from the discovery result
          accurate.projectPath = match.projectPath;
          return accurate;
        } catch {
          // Fall back to breakdown data if --id fails
          return match;
        }
      }

      return match;
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

  /**
   * Locate the most recent (or query-matched) transcript by scanning
   * ~/.claude/projects/<slug>/<uuid>.jsonl directly, then fetch its
   * accurate totals via `ccusage session --id`.
   *
   * Used when ccusage's session list aggregates per-project (returning
   * `projectPath: "Unknown Project"` for every entry) and so cannot
   * resolve a real session UUID on its own.
   */
  private async findSessionViaFilesystem(
    sessionQuery?: string,
  ): Promise<CcusageSession> {
    const projectsDir = join(homedir(), ".claude", "projects");

    let projectDirs: string[];
    try {
      projectDirs = await readdir(projectsDir);
    } catch {
      throw new Error(
        `No session data found and cannot read ${projectsDir}`,
      );
    }

    type Candidate = { slug: string; uuid: string; mtime: number };
    const candidates: Candidate[] = [];

    for (const slug of projectDirs) {
      const dirPath = join(projectsDir, slug);
      let entries: string[];
      try {
        entries = await readdir(dirPath);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.endsWith(".jsonl")) continue;
        const uuid = entry.slice(0, -".jsonl".length);
        try {
          const s = await stat(join(dirPath, entry));
          candidates.push({ slug, uuid, mtime: s.mtimeMs });
        } catch {
          continue;
        }
      }
    }

    if (candidates.length === 0) {
      throw new Error(
        `No transcript files found in ${projectsDir}`,
      );
    }

    candidates.sort((a, b) => b.mtime - a.mtime);

    let pick: Candidate | undefined;
    if (!sessionQuery) {
      pick = candidates[0];
    } else {
      pick = candidates.find(
        (c) =>
          c.uuid === sessionQuery ||
          c.uuid.startsWith(sessionQuery) ||
          c.slug === sessionQuery ||
          c.slug.startsWith(sessionQuery),
      );
    }

    if (!pick) {
      const sample = candidates
        .slice(0, 10)
        .map((c) => `  ${c.uuid.slice(0, 8)}  ${c.slug}`)
        .join("\n");
      throw new Error(
        `No session matching "${sessionQuery}". Recent sessions:\n${sample}`,
      );
    }

    const accurate = await this.fetchSessionById(pick.uuid);
    accurate.projectPath = `${pick.slug}/${pick.uuid}`;
    return accurate;
  }
}
