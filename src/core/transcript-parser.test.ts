import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { TranscriptParser } from "./transcript-parser.js";

let tmpDir: string;
const parser = new TranscriptParser();

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "transcript-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeJsonl(lines: object[]): Promise<string> {
  const path = join(tmpDir, "transcript.jsonl");
  await writeFile(path, lines.map((l) => JSON.stringify(l)).join("\n"));
  return path;
}

describe("TranscriptParser", () => {
  it("throws when transcript file does not exist", async () => {
    await expect(
      parser.parseTranscript(join(tmpDir, "missing.jsonl")),
    ).rejects.toThrow(/not found/);
  });

  it("extracts slug from first user message", async () => {
    const path = await writeJsonl([
      {
        type: "user",
        slug: "quirky-crafting-floyd",
        timestamp: "2026-05-16T10:00:00Z",
        message: { content: "hello" },
      },
      {
        type: "assistant",
        timestamp: "2026-05-16T10:00:05Z",
        message: { content: "hi" },
      },
    ]);

    const result = await parser.parseTranscript(path);
    expect(result.sessionSlug).toBe("quirky-crafting-floyd");
    expect(result.userMessageCount).toBe(1);
    expect(result.assistantMessageCount).toBe(1);
    expect(result.totalMessages).toBe(2);
  });

  it("falls back to 'unknown-session' when slug, cwd, and sessionId are all missing", async () => {
    const path = await writeJsonl([
      {
        type: "user",
        timestamp: "2026-05-16T10:00:00Z",
        message: { content: "hi" },
      },
    ]);
    const result = await parser.parseTranscript(path);
    expect(result.sessionSlug).toBe("unknown-session");
  });

  it("derives slug from cwd basename + sessionId prefix when legacy slug is missing", async () => {
    const path = await writeJsonl([
      {
        type: "user",
        timestamp: "2026-05-16T10:00:00Z",
        sessionId: "e048a51c-0f17-4a57-a70c-6df1e9f41241",
        cwd: "/Users/me/Code/my-cool-project",
        message: { content: "hi" },
      },
    ]);
    const result = await parser.parseTranscript(path);
    expect(result.sessionSlug).toBe("my-cool-project-e048a51c");
  });

  it("derives slug from non-user messages when first user message lacks cwd/sessionId", async () => {
    const path = await writeJsonl([
      {
        type: "file-history-snapshot",
        timestamp: "2026-05-16T10:00:00Z",
        sessionId: "abc12345-rest-of-uuid",
        cwd: "/Users/me/Code/another-project",
      },
      {
        type: "user",
        timestamp: "2026-05-16T10:00:01Z",
        message: { content: "hi" },
      },
    ]);
    const result = await parser.parseTranscript(path);
    expect(result.sessionSlug).toBe("another-project-abc12345");
  });

  it("uses only project name when sessionId is missing", async () => {
    const path = await writeJsonl([
      {
        type: "user",
        timestamp: "2026-05-16T10:00:00Z",
        cwd: "/Users/me/Code/lone-project",
        message: { content: "hi" },
      },
    ]);
    const result = await parser.parseTranscript(path);
    expect(result.sessionSlug).toBe("lone-project");
  });

  it("uses only UUID prefix when cwd is missing", async () => {
    const path = await writeJsonl([
      {
        type: "user",
        timestamp: "2026-05-16T10:00:00Z",
        sessionId: "deadbeef-cafe-1234-5678-abcdef012345",
        message: { content: "hi" },
      },
    ]);
    const result = await parser.parseTranscript(path);
    expect(result.sessionSlug).toBe("deadbeef");
  });

  it("computes startTime and endTime from first/last timestamps", async () => {
    const path = await writeJsonl([
      {
        type: "user",
        slug: "s",
        timestamp: "2026-05-16T10:00:00Z",
        message: { content: "a" },
      },
      {
        type: "assistant",
        timestamp: "2026-05-16T10:05:00Z",
        message: { content: "b" },
      },
      {
        type: "assistant",
        timestamp: "2026-05-16T10:15:00Z",
        message: { content: "c" },
      },
    ]);

    const result = await parser.parseTranscript(path);
    expect(result.startTime.toISOString()).toBe("2026-05-16T10:00:00.000Z");
    expect(result.endTime.toISOString()).toBe("2026-05-16T10:15:00.000Z");
  });

  it("extracts string-content first prompt and truncates at 100 chars", async () => {
    const longText = "x".repeat(150);
    const path = await writeJsonl([
      {
        type: "user",
        slug: "s",
        timestamp: "2026-05-16T10:00:00Z",
        message: { content: longText },
      },
    ]);

    const result = await parser.parseTranscript(path);
    expect(result.firstPrompt).toHaveLength(103); // 100 chars + "..."
    expect(result.firstPrompt.endsWith("...")).toBe(true);
  });

  it("extracts multipart-content first prompt joining text parts", async () => {
    const path = await writeJsonl([
      {
        type: "user",
        slug: "s",
        timestamp: "2026-05-16T10:00:00Z",
        message: {
          content: [
            { type: "text", text: "hello" },
            { type: "image", source: "..." },
            { type: "text", text: "world" },
          ],
        },
      },
    ]);

    const result = await parser.parseTranscript(path);
    expect(result.firstPrompt).toBe("hello world");
  });

  it("returns fallback prompt when no user message", async () => {
    const path = await writeJsonl([
      {
        type: "assistant",
        timestamp: "2026-05-16T10:00:00Z",
        message: { content: "I am alone" },
      },
    ]);

    const result = await parser.parseTranscript(path);
    expect(result.firstPrompt).toBe("No prompt available");
  });

  it("ignores blank lines", async () => {
    const path = join(tmpDir, "transcript.jsonl");
    await writeFile(
      path,
      [
        JSON.stringify({
          type: "user",
          slug: "s",
          timestamp: "2026-05-16T10:00:00Z",
          message: { content: "hi" },
        }),
        "",
        "   ",
      ].join("\n"),
    );

    const result = await parser.parseTranscript(path);
    expect(result.totalMessages).toBe(1);
  });
});
