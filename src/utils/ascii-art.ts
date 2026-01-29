/**
 * ASCII art headers for receipts
 */

export const CLAUDE_LOGO = `     ▐▛███▜▌
    ▝▜█████▛▘
      ▘▘ ▝▝   `;

/**
 * Get the Claude logo
 */
export function getHeader(): string {
  return CLAUDE_LOGO;
}

/**
 * Receipt section separators
 */
export const SEPARATOR = "━".repeat(35);
export const LIGHT_SEPARATOR = "─".repeat(35);
