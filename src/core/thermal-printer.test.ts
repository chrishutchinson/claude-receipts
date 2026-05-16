import { describe, it, expect } from "vitest";
import { ThermalPrinterRenderer } from "./thermal-printer.js";
import type { ReceiptData } from "./receipt-generator.js";

const baseData: ReceiptData = {
  sessionData: {
    sessionId: "abc-123",
    inputTokens: 1000,
    outputTokens: 500,
    cacheCreationTokens: 200,
    cacheReadTokens: 100,
    totalTokens: 1800,
    totalCost: 0.42,
    modelsUsed: ["claude-sonnet-4-5"],
    modelBreakdowns: [
      {
        modelName: "claude-sonnet-4-5",
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

// Access the private buildReceipt for byte-level testing
class TestableRenderer extends ThermalPrinterRenderer {
  build(data: ReceiptData): Buffer {
    return (this as any).buildReceipt(data);
  }
}

describe("ThermalPrinterRenderer.buildReceipt", () => {
  const renderer = new TestableRenderer();

  it("starts with ESC @ (printer init)", () => {
    const buf = renderer.build(baseData);
    expect(buf[0]).toBe(0x1b);
    expect(buf[1]).toBe(0x40);
  });

  it("sets a left margin via GS L right after init", () => {
    const buf = renderer.build(baseData);
    expect(buf[2]).toBe(0x1d);
    expect(buf[3]).toBe(0x4c);
  });

  it("ends with a partial cut (GS V 66 3)", () => {
    const buf = renderer.build(baseData);
    const tail = buf.subarray(buf.length - 4);
    expect(Array.from(tail)).toEqual([0x1d, 0x56, 0x42, 0x03]);
  });

  it("embeds location and slug as UTF-8 text", () => {
    const buf = renderer.build(baseData);
    const asText = buf.toString("utf-8");
    expect(asText).toContain("San Francisco, CA");
    expect(asText).toContain("quirky-crafting-floyd");
    expect(asText).toContain("Thank you for building!");
    expect(asText).toContain("TOTAL");
  });

  it("formats the total with currency", () => {
    const buf = renderer.build(baseData);
    expect(buf.toString("utf-8")).toContain("$0.42");
  });

  it("emits a QR code command sequence (GS ( k)", () => {
    const buf = renderer.build(baseData);
    // Look for GS ( k header byte sequence anywhere in the buffer
    let foundQr = false;
    for (let i = 0; i < buf.length - 2; i++) {
      if (buf[i] === 0x1d && buf[i + 1] === 0x28 && buf[i + 2] === 0x6b) {
        foundQr = true;
        break;
      }
    }
    expect(foundQr).toBe(true);
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
    const text = renderer.build(data).toString("utf-8");
    expect(text).not.toContain("Cache write");
    expect(text).not.toContain("Cache read");
  });

  it("produces a deterministic byte sequence for representative input", () => {
    const buf = renderer.build(baseData);
    expect(buf.toString("hex")).toMatchSnapshot();
  });
});
