import { describe, it, expect } from "vitest";
import { ReceiptGenerator, type ReceiptData } from "./receipt-generator.js";

const baseData: ReceiptData = {
  sessionData: {
    sessionId: "abc-123",
    inputTokens: 1000,
    outputTokens: 500,
    cacheCreationTokens: 200,
    cacheReadTokens: 100,
    totalTokens: 1800,
    totalCost: 0.42,
    modelsUsed: ["claude-sonnet-4-5-20260101"],
    modelBreakdowns: [
      {
        modelName: "claude-sonnet-4-5-20260101",
        inputTokens: 1000,
        outputTokens: 500,
        cacheCreationTokens: 200,
        cacheReadTokens: 100,
        cost: 0.42,
      },
    ],
  },
  transcriptData: {
    sessionSlug: "quirky-crafting-floyd",
    firstPrompt: "do the thing",
    startTime: new Date("2026-05-16T10:00:00Z"),
    endTime: new Date("2026-05-16T10:30:00Z"),
    userMessageCount: 5,
    assistantMessageCount: 5,
    totalMessages: 10,
  },
  location: "San Francisco, CA",
  config: { version: "1.0.0", timezone: "America/Los_Angeles" },
};

describe("ReceiptGenerator.generateReceipt", () => {
  const gen = new ReceiptGenerator();

  it("includes location, slug, and formatted totals", () => {
    const receipt = gen.generateReceipt(baseData);

    expect(receipt).toContain("San Francisco, CA");
    expect(receipt).toContain("quirky-crafting-floyd");
    expect(receipt).toContain("$0.42");
    expect(receipt).toContain("TOTAL");
    expect(receipt).toContain("SUBTOTAL");
    expect(receipt).toContain("Thank you for building!");
  });

  it("maps known model names to friendly names", () => {
    const receipt = gen.generateReceipt(baseData);
    expect(receipt).toContain("Claude Sonnet 4.5");
    expect(receipt).not.toContain("claude-sonnet-4-5-20260101");
  });

  it("falls back to raw model name for unknown models", () => {
    const data: ReceiptData = {
      ...baseData,
      sessionData: {
        ...baseData.sessionData,
        modelBreakdowns: [
          {
            ...baseData.sessionData.modelBreakdowns![0],
            modelName: "claude-future-model-7",
          },
        ],
      },
    };
    const receipt = gen.generateReceipt(data);
    expect(receipt).toContain("claude-future-model-7");
  });

  it("omits cache rows when cache tokens are zero", () => {
    const data: ReceiptData = {
      ...baseData,
      sessionData: {
        ...baseData.sessionData,
        modelBreakdowns: [
          {
            modelName: "claude-sonnet-4-5",
            inputTokens: 100,
            outputTokens: 50,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            cost: 0.1,
          },
        ],
      },
    };
    const receipt = gen.generateReceipt(data);
    expect(receipt).not.toContain("Cache write");
    expect(receipt).not.toContain("Cache read");
  });

  it("renders multiple model breakdowns", () => {
    const data: ReceiptData = {
      ...baseData,
      sessionData: {
        ...baseData.sessionData,
        modelBreakdowns: [
          {
            modelName: "claude-sonnet-4-5",
            inputTokens: 100,
            outputTokens: 50,
            cost: 0.1,
          },
          {
            modelName: "claude-opus-4-5",
            inputTokens: 200,
            outputTokens: 100,
            cost: 0.32,
          },
        ],
      },
    };
    const receipt = gen.generateReceipt(data);
    expect(receipt).toContain("Claude Sonnet 4.5");
    expect(receipt).toContain("Claude Opus 4.5");
  });

  it("picks main model from modelBreakdowns first, falls back to modelsUsed", () => {
    const noBreakdown: ReceiptData = {
      ...baseData,
      sessionData: {
        ...baseData.sessionData,
        modelBreakdowns: undefined,
        modelsUsed: ["claude-3-opus-20240229"],
      },
    };
    expect(gen.generateReceipt(noBreakdown)).toContain("CASHIER: Claude 3 Opus");

    const empty: ReceiptData = {
      ...baseData,
      sessionData: {
        ...baseData.sessionData,
        modelBreakdowns: undefined,
        modelsUsed: undefined,
      },
    };
    expect(gen.generateReceipt(empty)).toContain("CASHIER: Claude");
  });

  it("produces a stable snapshot for a representative input", () => {
    expect(gen.generateReceipt(baseData)).toMatchSnapshot();
  });
});
