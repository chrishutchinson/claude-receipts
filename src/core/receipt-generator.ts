import type { CcusageSession } from "../types/ccusage.js";
import type { ParsedTranscript } from "../types/transcript.js";
import type { ReceiptConfig } from "../types/config.js";
import {
  formatCurrency,
  formatNumber,
  formatDateTime,
  formatDuration,
} from "../utils/formatting.js";
import { getHeader, SEPARATOR, LIGHT_SEPARATOR } from "../utils/ascii-art.js";

export interface ReceiptData {
  sessionData: CcusageSession;
  transcriptData: ParsedTranscript;
  location: string;
  config: ReceiptConfig;
}

export class ReceiptGenerator {
  /**
   * Generate a complete receipt as text
   */
  generateReceipt(data: ReceiptData): string {
    const lines: string[] = [];

    // Header
    lines.push(SEPARATOR);
    lines.push(getHeader());
    lines.push(SEPARATOR);
    lines.push("");

    // Location and session info
    lines.push(this.centerText(`Location: ${data.location}`, 35));
    lines.push(
      this.centerText(`Session: ${data.transcriptData.sessionSlug}`, 35),
    );
    lines.push(
      this.centerText(
        formatDateTime(data.transcriptData.endTime, data.config.timezone),
        35,
      ),
    );
    lines.push("");

    // Line items header
    lines.push(SEPARATOR);
    lines.push(this.padLine("ITEM", "QTY", "PRICE"));
    lines.push(LIGHT_SEPARATOR);

    // Model breakdown
    if (
      data.sessionData.modelBreakdowns &&
      data.sessionData.modelBreakdowns.length > 0
    ) {
      for (const model of data.sessionData.modelBreakdowns) {
        lines.push(this.getModelName(model.modelName));

        // Input tokens
        lines.push(
          this.padLine(
            "  Input tokens",
            formatNumber(model.inputTokens),
            this.formatTokenCost(
              model.inputTokens,
              model.cost,
              data.sessionData.totalTokens,
            ),
          ),
        );

        // Output tokens
        lines.push(
          this.padLine(
            "  Output tokens",
            formatNumber(model.outputTokens),
            this.formatTokenCost(
              model.outputTokens,
              model.cost,
              data.sessionData.totalTokens,
            ),
          ),
        );

        // Cache tokens if present
        if (model.cacheCreationTokens && model.cacheCreationTokens > 0) {
          lines.push(
            this.padLine(
              "  Cache write",
              formatNumber(model.cacheCreationTokens),
              this.formatTokenCost(
                model.cacheCreationTokens,
                model.cost,
                data.sessionData.totalTokens,
              ),
            ),
          );
        }

        if (model.cacheReadTokens && model.cacheReadTokens > 0) {
          lines.push(
            this.padLine(
              "  Cache read",
              formatNumber(model.cacheReadTokens),
              this.formatTokenCost(
                model.cacheReadTokens,
                model.cost,
                data.sessionData.totalTokens,
              ),
            ),
          );
        }

        lines.push("");
      }
    }

    // Totals
    lines.push(SEPARATOR);
    lines.push(
      this.padLine("SUBTOTAL", "", formatCurrency(data.sessionData.totalCost)),
    );
    lines.push(LIGHT_SEPARATOR);
    lines.push(
      this.padLine("TOTAL", "", formatCurrency(data.sessionData.totalCost)),
    );
    lines.push(SEPARATOR);
    lines.push("");

    // Footer
    lines.push(`CASHIER: ${this.getMainModel(data.sessionData)}`);
    lines.push("");
    lines.push(this.centerText("Thank you for building!", 35));
    lines.push("");
    lines.push(SEPARATOR);

    return lines.join("\n");
  }

  /**
   * Format a line with left, middle, and right alignment
   */
  private padLine(
    left: string,
    middle: string,
    right: string,
    width: number = 35,
  ): string {
    const rightLen = right.length;
    const leftLen = left.length;
    const middleLen = middle.length;

    // Calculate spacing
    const totalContent = leftLen + middleLen + rightLen;
    const availableSpace = width - totalContent;

    if (availableSpace < 0) {
      // If content is too long, just concatenate
      return `${left} ${middle} ${right}`;
    }

    // Distribute space: left...middle...right
    const middleSpace = Math.floor(availableSpace / 2);
    const rightSpace = availableSpace - middleSpace;

    return (
      left + " ".repeat(middleSpace) + middle + " ".repeat(rightSpace) + right
    );
  }

  /**
   * Center text in a given width
   */
  private centerText(text: string, width: number): string {
    const padding = Math.max(0, Math.floor((width - text.length) / 2));
    return " ".repeat(padding) + text;
  }

  /**
   * Wrap text to a given width
   */
  private wrapText(text: string, width: number): string {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= width) {
        currentLine += (currentLine ? " " : "") + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines.join("\n");
  }

  /**
   * Format token cost (proportional to model cost)
   */
  private formatTokenCost(
    tokens: number,
    modelCost: number,
    totalTokens: number,
  ): string {
    const proportion = tokens / totalTokens;
    const cost = modelCost * proportion;
    return formatCurrency(cost);
  }

  /**
   * Get a clean model name
   */
  private getModelName(model: string): string {
    // Remove date suffixes and clean up model names
    const cleaned = model.replace(/-\d{8}$/, "");

    const modelMap: Record<string, string> = {
      "claude-sonnet-4-5": "Claude Sonnet 4.5",
      "claude-opus-4-5": "Claude Opus 4.5",
      "claude-3-5-sonnet": "Claude 3.5 Sonnet",
      "claude-3-opus": "Claude 3 Opus",
      "claude-3-haiku": "Claude 3 Haiku",
    };

    return modelMap[cleaned] || model;
  }

  /**
   * Get the main model used in the session
   */
  private getMainModel(sessionData: CcusageSession): string {
    if (sessionData.modelBreakdowns && sessionData.modelBreakdowns.length > 0) {
      return this.getModelName(sessionData.modelBreakdowns[0].modelName);
    }

    if (sessionData.modelsUsed && sessionData.modelsUsed.length > 0) {
      return this.getModelName(sessionData.modelsUsed[0]);
    }

    return "Claude";
  }
}
