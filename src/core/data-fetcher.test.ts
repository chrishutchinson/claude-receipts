import { describe, it, expect, vi, beforeEach } from "vitest";

const execaMock = vi.hoisted(() => vi.fn());
const readdirMock = vi.hoisted(() => vi.fn());
const statMock = vi.hoisted(() => vi.fn());
vi.mock("execa", () => ({ execa: execaMock }));
vi.mock("fs/promises", () => ({
  readdir: readdirMock,
  stat: statMock,
}));

const { DataFetcher } = await import("./data-fetcher.js");

beforeEach(() => {
  execaMock.mockReset();
  readdirMock.mockReset();
  statMock.mockReset();
});

function mockById(payload: object) {
  execaMock.mockResolvedValueOnce({ stdout: JSON.stringify(payload) });
}

function mockList(payload: object) {
  execaMock.mockResolvedValueOnce({ stdout: JSON.stringify(payload) });
}

describe("DataFetcher.fetchSessionById", () => {
  const fetcher = new DataFetcher();

  it("aggregates entries by model and totals tokens", async () => {
    mockById({
      sessionId: "session-xyz",
      totalCost: 1.0,
      totalTokens: 1500,
      entries: [
        {
          timestamp: "2026-05-16T10:00:00Z",
          inputTokens: 100,
          outputTokens: 50,
          cacheCreationTokens: 10,
          cacheReadTokens: 5,
          model: "claude-sonnet-4-5",
          costUSD: 0.5,
        },
        {
          timestamp: "2026-05-16T10:05:00Z",
          inputTokens: 200,
          outputTokens: 100,
          cacheCreationTokens: 20,
          cacheReadTokens: 15,
          model: "claude-sonnet-4-5",
          costUSD: 0.5,
        },
      ],
    });

    const result = await fetcher.fetchSessionById("session-xyz");

    expect(result.sessionId).toBe("session-xyz");
    expect(result.inputTokens).toBe(300);
    expect(result.outputTokens).toBe(150);
    expect(result.cacheCreationTokens).toBe(30);
    expect(result.cacheReadTokens).toBe(20);
    expect(result.modelBreakdowns).toHaveLength(1);
    expect(result.modelBreakdowns![0].cost).toBeCloseTo(1.0);
  });

  it("skips <synthetic> entries", async () => {
    mockById({
      sessionId: "s",
      totalCost: 1.0,
      totalTokens: 100,
      entries: [
        {
          timestamp: "t",
          inputTokens: 100,
          outputTokens: 0,
          model: "claude-sonnet-4-5",
          costUSD: 1.0,
        },
        {
          timestamp: "t",
          inputTokens: 9999,
          outputTokens: 9999,
          model: "<synthetic>",
          costUSD: 0,
        },
      ],
    });

    const result = await fetcher.fetchSessionById("s");
    expect(result.modelsUsed).toEqual(["claude-sonnet-4-5"]);
    expect(result.inputTokens).toBe(100);
  });

  it("distributes totalCost proportionally across models by token count", async () => {
    mockById({
      sessionId: "s",
      totalCost: 1.0,
      totalTokens: 400,
      entries: [
        {
          timestamp: "t",
          inputTokens: 100,
          outputTokens: 0,
          model: "model-a",
          costUSD: 0,
        },
        {
          timestamp: "t",
          inputTokens: 300,
          outputTokens: 0,
          model: "model-b",
          costUSD: 0,
        },
      ],
    });

    const result = await fetcher.fetchSessionById("s");
    const byName = new Map(
      result.modelBreakdowns!.map((m) => [m.modelName, m.cost]),
    );
    expect(byName.get("model-a")).toBeCloseTo(0.25);
    expect(byName.get("model-b")).toBeCloseTo(0.75);
  });

  it("returns zero per-model cost when there are no real tokens", async () => {
    mockById({
      sessionId: "s",
      totalCost: 0,
      totalTokens: 0,
      entries: [
        {
          timestamp: "t",
          inputTokens: 0,
          outputTokens: 0,
          model: "model-a",
          costUSD: 0,
        },
      ],
    });

    const result = await fetcher.fetchSessionById("s");
    expect(result.modelBreakdowns![0].cost).toBe(0);
  });

  it("handles missing optional cache token fields", async () => {
    mockById({
      sessionId: "s",
      totalCost: 0.1,
      totalTokens: 10,
      entries: [
        {
          timestamp: "t",
          inputTokens: 10,
          outputTokens: 0,
          model: "model-a",
          costUSD: 0.1,
        },
      ],
    });

    const result = await fetcher.fetchSessionById("s");
    expect(result.cacheCreationTokens).toBe(0);
    expect(result.cacheReadTokens).toBe(0);
  });
});

describe("DataFetcher.fetchSessionData", () => {
  const fetcher = new DataFetcher();

  it("falls back to filesystem scan when ccusage returns only 'Unknown Project' entries", async () => {
    mockList({
      sessions: [
        { sessionId: "-Users-me-proj", projectPath: "Unknown Project", totalCost: 0 },
      ],
      totals: {},
    });
    readdirMock.mockResolvedValueOnce(["-Users-me-proj"]);
    readdirMock.mockResolvedValueOnce([
      "aaaa-uuid.jsonl",
      "bbbb-uuid.jsonl",
    ]);
    statMock.mockResolvedValueOnce({ mtimeMs: 1000 });
    statMock.mockResolvedValueOnce({ mtimeMs: 2000 });
    mockById({
      sessionId: "bbbb-uuid",
      totalCost: 1.5,
      totalTokens: 200,
      entries: [
        {
          timestamp: "t",
          inputTokens: 200,
          outputTokens: 0,
          model: "m",
          costUSD: 1.5,
        },
      ],
    });

    const result = await fetcher.fetchSessionData();
    expect(result.sessionId).toBe("bbbb-uuid");
    expect(result.projectPath).toBe("-Users-me-proj/bbbb-uuid");
    expect(result.totalCost).toBe(1.5);
  });

  it("throws a clear error when filesystem fallback has no transcripts", async () => {
    mockList({
      sessions: [
        { sessionId: "-Users-me-proj", projectPath: "Unknown Project", totalCost: 0 },
      ],
      totals: {},
    });
    readdirMock.mockResolvedValueOnce([]);

    await expect(fetcher.fetchSessionData()).rejects.toThrow(
      /No transcript files found/,
    );
  });

  it("matches by UUID prefix inside the filesystem fallback", async () => {
    mockList({
      sessions: [
        { sessionId: "-Users-me-proj", projectPath: "Unknown Project", totalCost: 0 },
      ],
      totals: {},
    });
    readdirMock.mockResolvedValueOnce(["-Users-me-proj"]);
    readdirMock.mockResolvedValueOnce([
      "aaaa1111-rest.jsonl",
      "bbbb2222-rest.jsonl",
    ]);
    // aaaa is OLDER but the query targets it explicitly
    statMock.mockResolvedValueOnce({ mtimeMs: 1000 });
    statMock.mockResolvedValueOnce({ mtimeMs: 2000 });
    mockById({
      sessionId: "aaaa1111-rest",
      totalCost: 0.42,
      totalTokens: 50,
      entries: [
        { timestamp: "t", inputTokens: 50, outputTokens: 0, model: "m", costUSD: 0.42 },
      ],
    });

    const result = await fetcher.fetchSessionData("aaaa1111");
    expect(result.sessionId).toBe("aaaa1111-rest");
    expect(result.projectPath).toBe("-Users-me-proj/aaaa1111-rest");
  });

  it("throws 'No session matching' when filesystem fallback finds nothing for query", async () => {
    mockList({
      sessions: [
        { sessionId: "-Users-me-proj", projectPath: "Unknown Project", totalCost: 0 },
      ],
      totals: {},
    });
    readdirMock.mockResolvedValueOnce(["-Users-me-proj"]);
    readdirMock.mockResolvedValueOnce(["aaaa1111-rest.jsonl"]);
    statMock.mockResolvedValueOnce({ mtimeMs: 1000 });

    await expect(fetcher.fetchSessionData("nope")).rejects.toThrow(
      /No session matching "nope"/,
    );
  });

  it("throws a clear error when ~/.claude/projects cannot be read", async () => {
    mockList({
      sessions: [
        { sessionId: "-Users-me-proj", projectPath: "Unknown Project", totalCost: 0 },
      ],
      totals: {},
    });
    readdirMock.mockRejectedValueOnce(new Error("ENOENT"));

    await expect(fetcher.fetchSessionData()).rejects.toThrow(
      /cannot read .*\.claude\/projects/,
    );
  });

  it("returns first valid session when no query given (after --id refetch)", async () => {
    mockList({
      sessions: [
        {
          sessionId: "first",
          projectPath: "proj/aaa-uuid",
          totalCost: 0.5,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 100,
        },
        {
          sessionId: "second",
          projectPath: "proj/bbb-uuid",
          totalCost: 1.0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 100,
        },
      ],
      totals: {},
    });
    mockById({
      sessionId: "first",
      totalCost: 0.5,
      totalTokens: 100,
      entries: [
        {
          timestamp: "t",
          inputTokens: 100,
          outputTokens: 0,
          model: "m",
          costUSD: 0.5,
        },
      ],
    });

    const result = await fetcher.fetchSessionData();
    expect(result.sessionId).toBe("first");
    expect(result.projectPath).toBe("proj/aaa-uuid");
  });

  it("matches by UUID prefix from projectPath", async () => {
    mockList({
      sessions: [
        {
          sessionId: "first",
          projectPath: "proj/aaa11111-uuid",
          totalCost: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 100,
        },
        {
          sessionId: "second",
          projectPath: "proj/bbb22222-uuid",
          totalCost: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 100,
        },
      ],
      totals: {},
    });
    mockById({
      sessionId: "second",
      totalCost: 0.7,
      totalTokens: 100,
      entries: [
        {
          timestamp: "t",
          inputTokens: 100,
          outputTokens: 0,
          model: "m",
          costUSD: 0.7,
        },
      ],
    });

    const result = await fetcher.fetchSessionData("bbb22222");
    expect(result.sessionId).toBe("second");
  });

  it("falls back to breakdown data when --id refetch fails", async () => {
    mockList({
      sessions: [
        {
          sessionId: "first",
          projectPath: "proj/aaa-uuid",
          totalCost: 0.5,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 100,
        },
      ],
      totals: {},
    });
    execaMock.mockRejectedValueOnce(new Error("ccusage exploded"));

    const result = await fetcher.fetchSessionData();
    expect(result.sessionId).toBe("first");
    expect(result.totalCost).toBe(0.5);
  });

  it("throws a helpful error when query matches nothing", async () => {
    mockList({
      sessions: [
        {
          sessionId: "first",
          projectPath: "proj/aaa-uuid",
          totalCost: 0.5,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 100,
        },
      ],
      totals: {},
    });

    await expect(fetcher.fetchSessionData("nope")).rejects.toThrow(
      /No session matching "nope"/,
    );
  });
});
