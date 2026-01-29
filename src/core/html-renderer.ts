import type { ReceiptData } from "./receipt-generator.js";
import {
  formatCurrency,
  formatNumber,
  formatDateTime,
  formatDuration,
} from "../utils/formatting.js";

export class HtmlRenderer {
  /**
   * Generate HTML receipt with embedded CSS
   */
  generateHtml(data: ReceiptData, receiptText: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Receipt - ${data.transcriptData.sessionSlug}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Courier New', Courier, monospace;
      background: #3a3a3a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .receipt {
      background: #f8f8f8;
      width: 400px;
      padding: 30px 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
      position: relative;
      animation: slideIn 0.5s ease-out;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .receipt::before,
    .receipt::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      height: 15px;
      background: repeating-linear-gradient(
        90deg,
        transparent,
        transparent 10px,
        #f8f8f8 10px,
        #f8f8f8 20px
      );
    }

    .receipt::before {
      top: -15px;
    }

    .receipt::after {
      bottom: -15px;
    }

    .receipt-content {
      color: #333;
      font-size: 14px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .header {
      text-align: center;
      margin-bottom: 20px;
      padding: 20px 0;
      border-bottom: 2px dashed #999;
    }

    .logo {
      font-size: 16px;
      line-height: 1.2;
      font-weight: bold;
      white-space: pre;
      display: inline-block;
      margin: 10px 0;
    }

    .separator {
      border-bottom: 2px solid #333;
      margin: 15px 0;
    }

    .light-separator {
      border-bottom: 1px dashed #999;
      margin: 10px 0;
    }

    .summary {
      background: #fff;
      padding: 15px;
      margin: 15px 0;
      border-left: 4px solid #333;
    }

    .line-item {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
    }

    .model-name {
      font-weight: bold;
      margin-top: 10px;
      color: #333;
    }

    .total-section {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 2px solid #333;
    }

    .total {
      font-size: 18px;
      font-weight: bold;
      display: flex;
      justify-content: space-between;
      margin: 10px 0;
    }

    .footer {
      text-align: center;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 2px dashed #999;
      font-size: 12px;
      color: #666;
    }

    .footer-message {
      font-size: 16px;
      margin: 15px 0;
      color: #333;
    }

    .meta {
      text-align: center;
      margin: 10px 0;
      color: #666;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .download-link {
      text-align: center;
      margin-top: 20px;
    }

    .download-link a {
      display: inline-block;
      padding: 10px 20px;
      background: #333;
      color: white;
      text-decoration: none;
      border-radius: 5px;
      font-size: 12px;
      transition: background 0.3s;
    }

    .download-link a:hover {
      background: #000;
    }

    .generated-by {
      font-size: 14px;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px dashed #999;
    }

    @media print {
      body {
        background: white;
      }
      .receipt {
        box-shadow: none;
        width: 100%;
      }
      .download-link {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="logo"> ▐▛███▜▌
 ▝▜█████▛▘
 ▘▘ ▝▝
</div>
      <div class="meta">
        <div>Location: ${this.escapeHtml(data.location)}</div>
        <div>Session: ${this.escapeHtml(data.transcriptData.sessionSlug)}</div>
        <div>Date: ${formatDateTime(data.transcriptData.endTime, data.config.timezone)}</div>
      </div>
    </div>

    <div class="separator"></div>

    ${this.renderLineItems(data)}

    <div class="total-section">
      <div class="total">
        <span>TOTAL</span>
        <span>${formatCurrency(data.sessionData.totalCost)}</span>
      </div>
    </div>

    <div class="footer">
      <div>CASHIER: ${this.getMainModel(data)}</div>
      <div class="footer-message">Thank you for building!</div>
      <div class="generated-by">
        Print your own <strong>Claude receipts</strong> with<br>
        <a href="https://github.com/chrishutchinson/claude-receipts" style="color: #333;">github.com/chrishutchinson/claude-receipts</a>
      </div>
    </div>
  </div>

  <script>
    // Add keyboard shortcut to close window
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        window.close();
      }
    });

    // Log receipt info
    console.log('Claude Receipt Generated!');
    console.log('Session:', '${this.escapeHtml(data.transcriptData.sessionSlug)}');
    console.log('Cost:', '${formatCurrency(data.sessionData.totalCost)}');
    console.log('Press ESC to close');
  </script>
</body>
</html>`;
  }

  /**
   * Render line items HTML
   */
  private renderLineItems(data: ReceiptData): string {
    let html = '<div style="margin: 20px 0;">';

    if (
      data.sessionData.modelBreakdowns &&
      data.sessionData.modelBreakdowns.length > 0
    ) {
      for (const model of data.sessionData.modelBreakdowns) {
        html += `<div class="model-name">${this.escapeHtml(this.getModelName(model.modelName))}</div>`;

        html += `<div class="line-item">
          <span>  Input tokens</span>
          <span>${formatNumber(model.inputTokens)} • ${this.formatTokenCost(model.inputTokens, model.cost, data.sessionData.totalTokens)}</span>
        </div>`;

        html += `<div class="line-item">
          <span>  Output tokens</span>
          <span>${formatNumber(model.outputTokens)} • ${this.formatTokenCost(model.outputTokens, model.cost, data.sessionData.totalTokens)}</span>
        </div>`;

        if (model.cacheCreationTokens && model.cacheCreationTokens > 0) {
          html += `<div class="line-item">
            <span>  Cache write</span>
            <span>${formatNumber(model.cacheCreationTokens)} • ${this.formatTokenCost(model.cacheCreationTokens, model.cost, data.sessionData.totalTokens)}</span>
          </div>`;
        }

        if (model.cacheReadTokens && model.cacheReadTokens > 0) {
          html += `<div class="line-item">
            <span>  Cache read</span>
            <span>${formatNumber(model.cacheReadTokens)} • ${this.formatTokenCost(model.cacheReadTokens, model.cost, data.sessionData.totalTokens)}</span>
          </div>`;
        }
      }
    }

    html += "</div>";
    return html;
  }

  /**
   * Format token cost
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
   * Get clean model name
   */
  private getModelName(model: string): string {
    const cleaned = model.replace(/-\d{8}$/, "");

    const modelMap: Record<string, string> = {
      "claude-sonnet-4-5": "Claude Sonnet 4.5",
      "claude-opus-4-5": "Claude Opus 4.5",
      "claude-3-5-sonnet": "Claude 3.5 Sonnet",
      "claude-3-opus": "Claude 3 Opus",
      "claude-3-haiku": "Claude 3 Haiku",
      "claude-haiku-4-5": "Claude Haiku 4.5",
    };

    return modelMap[cleaned] || model;
  }

  /**
   * Get main model
   */
  private getMainModel(data: ReceiptData): string {
    if (
      data.sessionData.modelBreakdowns &&
      data.sessionData.modelBreakdowns.length > 0
    ) {
      return this.getModelName(data.sessionData.modelBreakdowns[0].modelName);
    }

    if (data.sessionData.modelsUsed && data.sessionData.modelsUsed.length > 0) {
      return this.getModelName(data.sessionData.modelsUsed[0]);
    }

    return "Claude";
  }

  /**
   * Escape HTML entities
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
