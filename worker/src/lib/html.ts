import type { ShareableReceiptData, ModelBreakdown } from "../types.js";

/**
 * Escape HTML entities for safe rendering
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Format currency (2 decimal places)
 */
function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Format number with commas
 */
function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

/**
 * Format date/time
 */
function formatDateTime(dateStr: string, timezone?: string): string {
  const date = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  };
  if (timezone) {
    options.timeZone = timezone;
  }
  return date.toLocaleString("en-US", options);
}

/**
 * Get clean model name
 */
function getModelName(model: string): string {
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
 * Get main model used
 */
function getMainModel(breakdowns: ModelBreakdown[]): string {
  if (breakdowns.length > 0) {
    return getModelName(breakdowns[0].modelName);
  }
  return "Claude";
}

/**
 * Render line items HTML
 * Shows token counts and model subtotals (not per-token-type costs, which would be inaccurate)
 */
function renderLineItems(receipt: ShareableReceiptData): string {
  let html = '<div style="margin: 20px 0;">';

  for (const model of receipt.modelBreakdowns) {
    // Model name with its subtotal cost
    html += `<div class="model-header">
      <span class="model-name">${escapeHtml(getModelName(model.modelName))}</span>
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

  html += "</div>";
  return html;
}

/**
 * Generate public receipt HTML page
 */
export function generatePublicReceiptHtml(
  receipt: ShareableReceiptData,
  id: string,
  baseUrl: string,
): string {
  const publicUrl = `${baseUrl}/r/${id}`;
  const description = `Claude Code session receipt - ${formatCurrency(receipt.totalCost)} spent with ${formatNumber(receipt.totalTokens)} tokens`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Receipt - ${escapeHtml(receipt.sessionSlug)}</title>

  <!-- Open Graph / Social Media -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(publicUrl)}">
  <meta property="og:title" content="Claude Receipt - ${escapeHtml(receipt.sessionSlug)}">
  <meta property="og:description" content="${escapeHtml(description)}">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Claude Receipt - ${escapeHtml(receipt.sessionSlug)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">

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

    .generated-by {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px dashed #999;
    }

    .generated-by a {
      color: #333;
    }

    .copy-link {
      background: #333;
      color: white;
      border: none;
      padding: 12px 24px;
      font-family: 'Courier New', Courier, monospace;
      cursor: pointer;
      border-radius: 5px;
      transition: background 0.3s;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .copy-link:hover {
      background: #000;
    }

    .copy-link.copied {
      background: #2d5a27;
    }

    @media print {
      body {
        background: white;
      }
      .receipt {
        box-shadow: none;
        width: 100%;
      }
      .copy-link {
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
            <div>Location</div><div class="dots">....................</div><div class="value">${escapeHtml(receipt.location)}</div>
          </div>
          <div class="meta-row">
            <div>Session</div><div class="dots">....................</div><div class="value">${escapeHtml(receipt.sessionSlug)}</div>
          </div>
          <div class="meta-row">
            <div>Date</div><div class="dots">....................</div><div class="value">${formatDateTime(receipt.sessionDate, receipt.timezone)}</div>
          </div>
        </div>
      </div>

      <div class="separator"></div>

      ${renderLineItems(receipt)}

      <div class="total-section">
        <div class="total">
          <span>TOTAL</span>
          <span>${formatCurrency(receipt.totalCost)}</span>
        </div>
      </div>

      <div class="footer">
        <div>CASHIER: ${escapeHtml(getMainModel(receipt.modelBreakdowns))}</div>
        <div class="footer-message">Thank you for building!</div>
        <div class="generated-by">
          Print your own <strong>Claude receipts</strong> with<br>
          <a href="https://github.com/chrishutchinson/claude-receipts">github.com/chrishutchinson/claude-receipts</a>
        </div>
      </div>
    </div>

    <button class="copy-link" onclick="copyLink()">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <span id="copy-text">Copy Link</span>
    </button>
  </div>

  <script>
    function copyLink() {
      const url = window.location.href;
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.querySelector('.copy-link');
        const text = document.getElementById('copy-text');
        btn.classList.add('copied');
        text.textContent = 'Copied!';
        setTimeout(() => {
          btn.classList.remove('copied');
          text.textContent = 'Copy Link';
        }, 2000);
      });
    }
  </script>
</body>
</html>`;
}

/**
 * Generate 404 page
 */
export function generate404Html(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt Not Found</title>
  <style>
    body {
      font-family: 'Courier New', Courier, monospace;
      background: #3a3a3a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      color: #f8f8f8;
    }
    .container {
      text-align: center;
    }
    h1 {
      font-size: 48px;
      margin-bottom: 20px;
    }
    p {
      font-size: 18px;
      margin-bottom: 30px;
    }
    a {
      color: #f8f8f8;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>404</h1>
    <p>This receipt was not found or has been removed.</p>
    <p>Generate your own receipts at<br>
    <a href="https://github.com/chrishutchinson/claude-receipts">github.com/chrishutchinson/claude-receipts</a></p>
  </div>
</body>
</html>`;
}
