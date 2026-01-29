import type { ReceiptData } from "./receipt-generator.js";
import {
  formatCurrency,
  formatNumber,
  formatDateTime,
  formatDuration,
} from "../utils/formatting.js";

// Shareable receipt data structure (matches worker/src/types.ts)
export interface ShareableReceiptData {
  sessionSlug: string;
  location: string;
  sessionDate: string;
  timezone?: string;
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelBreakdowns: Array<{
    modelName: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    cost: number;
  }>;
  userMessageCount: number;
  assistantMessageCount: number;
  totalMessages: number;
}

const SHARE_API_URL = "https://receipts.chrishutchinson.dev";

export class HtmlRenderer {
  /**
   * Extract shareable data from receipt data (excludes sensitive fields)
   */
  getShareableData(data: ReceiptData): ShareableReceiptData {
    return {
      sessionSlug: data.transcriptData.sessionSlug,
      location: data.location,
      sessionDate: data.transcriptData.endTime.toISOString(),
      timezone: data.config.timezone,
      totalCost: data.sessionData.totalCost,
      totalTokens: data.sessionData.totalTokens,
      inputTokens: data.sessionData.inputTokens,
      outputTokens: data.sessionData.outputTokens,
      cacheCreationTokens: data.sessionData.cacheCreationTokens || 0,
      cacheReadTokens: data.sessionData.cacheReadTokens || 0,
      modelBreakdowns: (data.sessionData.modelBreakdowns || []).map((m) => ({
        modelName: m.modelName,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        cacheCreationTokens: m.cacheCreationTokens,
        cacheReadTokens: m.cacheReadTokens,
        cost: m.cost,
      })),
      userMessageCount: data.transcriptData.userMessageCount,
      assistantMessageCount: data.transcriptData.assistantMessageCount,
      totalMessages: data.transcriptData.totalMessages,
    };
  }

  /**
   * Generate HTML receipt with embedded CSS
   */
  generateHtml(data: ReceiptData, receiptText: string): string {
    const shareableData = this.getShareableData(data);

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
      font-size: 16px;
      background: #3a3a3a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .receipt-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 40px;
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
      left: -10px;
    }

    .receipt::after {
      bottom: -15px;
    }

    .receipt-content {
      color: #333;
      line-height: 1.6;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .header {
      text-align: center;
      padding: 20px 0;
    }

    .logo {
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
      padding: 3px 0;
      color: #555;
    }

    .model-header {
      display: flex;
      justify-content: space-between;
      padding: 8px 0 4px 0;
      margin-top: 10px;
      border-bottom: 1px dashed #ccc;
    }

    .model-header:first-child {
      margin-top: 0;
    }

    .model-name {
      font-weight: bold;
      color: #333;
    }

    .model-cost {
      font-weight: bold;
      color: #333;
    }

    .total-section {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 2px solid #333;
    }

    .total {
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
      color: #666;
    }

    .footer-message {
      margin: 15px 0;
      color: #333;
    }

    .meta {
      margin: 10px 0;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .meta-row {
      color: #666;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 1px;
      text-align: left;
    }

    .meta .dots {
      overflow: hidden;
      text-wrap: auto;
      word-wrap: break-word;
      height: 1rem;
    }

    .meta .value {
      text-align: right;
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
      transition: background 0.3s;
    }

    .download-link a:hover {
      background: #000;
    }

    .generated-by {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px dashed #999;
    }

    .share-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }

    .share-btn {
      background: #333;
      color: white;
      border: none;
      padding: 12px 24px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 16px;
      cursor: pointer;
      border-radius: 5px;
      transition: background 0.3s;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .share-btn:hover {
      background: #000;
    }

    .share-btn:disabled {
      background: #666;
      cursor: not-allowed;
    }

    .share-btn.success {
      background: #2d5a27;
    }

    .share-btn.error {
      background: #8b2020;
    }

    .share-result {
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      animation: fadeIn 0.3s ease-out;
    }

    .share-result.visible {
      display: flex;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .share-url {
      background: #f8f8f8;
      padding: 10px 15px;
      border-radius: 5px;
      color: #333;
      word-break: break-all;
      max-width: 400px;
      text-align: center;
    }

    .share-url a {
      color: #333;
      text-decoration: underline;
    }

    .copy-btn {
      background: #333;
      color: white;
      border: none;
      padding: 8px 16px;
      font-family: 'Courier New', Courier, monospace;
      cursor: pointer;
      border-radius: 5px;
      transition: background 0.3s;
    }

    .copy-btn:hover {
      background: #000;
    }

    .copy-btn.copied {
      background: #2d5a27;
    }

    .share-error {
      color: #ff6b6b;
      text-align: center;
      max-width: 350px;
    }

    @media print {
      body {
        background: white;
      }
      .receipt {
        box-shadow: none;
        width: 100%;
      }
      .download-link,
      .share-section {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="receipt">
      <div class="header">
        <div class="logo"> ▐▛███▜▌
 ▝▜█████▛▘
 ▘▘ ▝▝
</div>
        <div class="meta">
          <div class="meta-row">
            <div>Location</div><div class="dots">....................</div><div class="value">${this.escapeHtml(data.location)}</div>
          </div>
          <div class="meta-row">
            <div>Session</div><div class="dots">....................</div><div class="value">${this.escapeHtml(data.transcriptData.sessionSlug)}</div>
          </div>
          <div class="meta-row">
            <div>Date</div><div class="dots">....................</div><div class="value">${formatDateTime(data.transcriptData.endTime, data.config.timezone)}</div>
          </div>
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

    <div class="share-section">
      <button class="share-btn" id="share-btn" onclick="shareReceipt()">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3"></circle>
          <circle cx="6" cy="12" r="3"></circle>
          <circle cx="18" cy="19" r="3"></circle>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
        </svg>
        <span id="share-btn-text">Share Publicly</span>
      </button>

      <div class="share-result" id="share-result">
        <div class="share-url" id="share-url"></div>
        <button class="copy-btn" id="copy-btn" onclick="copyShareLink()">
          Copy Link
        </button>
      </div>

      <div class="share-error" id="share-error"></div>
    </div>
  </div>

  <!-- Embedded receipt data for sharing -->
  <script id="receipt-data" type="application/json">
${JSON.stringify(shareableData, null, 2)}
  </script>

  <script>
    const SHARE_API_URL = '${SHARE_API_URL}';
    let sharedUrl = null;

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

    async function shareReceipt() {
      const btn = document.getElementById('share-btn');
      const btnText = document.getElementById('share-btn-text');
      const resultDiv = document.getElementById('share-result');
      const urlDiv = document.getElementById('share-url');
      const errorDiv = document.getElementById('share-error');

      // Reset state
      resultDiv.classList.remove('visible');
      errorDiv.textContent = '';
      errorDiv.style.display = 'none';

      // Get receipt data
      const dataScript = document.getElementById('receipt-data');
      const receiptData = JSON.parse(dataScript.textContent);

      // Disable button and show loading
      btn.disabled = true;
      btnText.textContent = 'Sharing...';

      try {
        const response = await fetch(SHARE_API_URL + '/api/receipts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(receiptData),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || result.error || 'Failed to share receipt');
        }

        // Success
        sharedUrl = result.url;
        urlDiv.innerHTML = '<a href="' + sharedUrl + '" target="_blank">' + sharedUrl + '</a>';
        resultDiv.classList.add('visible');

        btn.classList.add('success');
        btnText.textContent = 'Shared!';

        // Keep button disabled since already shared
        console.log('Receipt shared:', sharedUrl);

      } catch (error) {
        console.error('Share error:', error);

        btn.classList.add('error');
        btnText.textContent = 'Share Failed';
        errorDiv.textContent = error.message;
        errorDiv.style.display = 'block';

        // Re-enable button after error
        setTimeout(() => {
          btn.disabled = false;
          btn.classList.remove('error');
          btnText.textContent = 'Share Publicly';
        }, 3000);
      }
    }

    function copyShareLink() {
      if (!sharedUrl) return;

      const copyBtn = document.getElementById('copy-btn');

      navigator.clipboard.writeText(sharedUrl).then(() => {
        copyBtn.classList.add('copied');
        copyBtn.textContent = 'Copied!';

        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.textContent = 'Copy Link';
        }, 2000);
      }).catch(err => {
        console.error('Copy failed:', err);
      });
    }
  </script>
</body>
</html>`;
  }

  /**
   * Render line items HTML
   * Shows token counts and model subtotals (not per-token-type costs, which would be inaccurate)
   */
  private renderLineItems(data: ReceiptData): string {
    let html = '<div style="margin: 20px 0;">';

    if (
      data.sessionData.modelBreakdowns &&
      data.sessionData.modelBreakdowns.length > 0
    ) {
      for (const model of data.sessionData.modelBreakdowns) {
        // Model name with its subtotal cost
        html += `<div class="model-header">
          <span class="model-name">${this.escapeHtml(this.getModelName(model.modelName))}</span>
          <span class="model-cost">${formatCurrency(model.cost)}</span>
        </div>`;

        html += `<div class="line-item">
          <span>  Input tokens</span>
          <span>${formatNumber(model.inputTokens)}</span>
        </div>`;

        html += `<div class="line-item">
          <span>  Output tokens</span>
          <span>${formatNumber(model.outputTokens)}</span>
        </div>`;

        if (model.cacheCreationTokens && model.cacheCreationTokens > 0) {
          html += `<div class="line-item">
            <span>  Cache write</span>
            <span>${formatNumber(model.cacheCreationTokens)}</span>
          </div>`;
        }

        if (model.cacheReadTokens && model.cacheReadTokens > 0) {
          html += `<div class="line-item">
            <span>  Cache read</span>
            <span>${formatNumber(model.cacheReadTokens)}</span>
          </div>`;
        }
      }
    }

    html += "</div>";
    return html;
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
