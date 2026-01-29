# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**claude-receipts** is an NPM package that generates beautiful thermal printer-style receipts for Claude Code usage sessions. It integrates with Claude Code's SessionEnd hook to automatically create HTML receipts that open in the browser when a coding session ends.

## Development Commands

```bash
# Build TypeScript to JavaScript
npm run build

# Watch mode for development
npm run dev

# Test the CLI locally (after building)
node bin/claude-receipts.js generate
node bin/claude-receipts.js generate --output html
node bin/claude-receipts.js config --show
node bin/claude-receipts.js setup

# Install locally for testing as if installed globally
npm link
claude-receipts generate

# Prepare for publishing
npm run prepublishOnly  # Runs build automatically
```

## Architecture

### Data Flow

The package operates in two modes:

1. **Hook Mode** (automatic): SessionEnd hook → stdin JSON → generate HTML → open browser
2. **Manual Mode**: CLI command → fetch recent session → output to console/HTML

```
SessionEnd Hook
  ↓ (stdin with session_id, transcript_path)
GenerateCommand
  ↓
DataFetcher (calls ccusage CLI) + TranscriptParser (reads JSONL)
  ↓
ReceiptGenerator (creates text) + HtmlRenderer (creates styled HTML)
  ↓
Save to ~/.claude-receipts/projects/[session-slug].html + open browser
```

### Key Components

**Commands** (`src/commands/`)

- `generate.ts` - Main command; auto-detects if called from hook via stdin
- `setup.ts` - Modifies `~/.claude/settings.json` to install SessionEnd hook
- `config.ts` - Manages user configuration at `~/.claude-receipts.config.json`

**Core Logic** (`src/core/`)

- `data-fetcher.ts` - Executes `npx ccusage session --json --breakdown` to get usage data
- `transcript-parser.ts` - Parses `~/.claude/projects/[path].jsonl` for session metadata (slug, timestamps, message counts)
- `receipt-generator.ts` - Creates ASCII text receipt with Claude logo, location, costs
- `html-renderer.ts` - Generates standalone HTML with embedded CSS (thermal printer aesthetic)
- `config-manager.ts` - Handles `~/.claude-receipts.config.json` I/O

**Utils** (`src/utils/`)

- `location.ts` - Location detection chain: CLI flag → config → IP geolocation (geoip-lite) → fallback
- `formatting.ts` - Currency, number, date/time, duration formatting
- `ascii-art.ts` - Claude logo and separators for text receipts

### Critical Implementation Details

**SessionEnd Hook Integration**

- Hook receives JSON via stdin: `{session_id, transcript_path, cwd, ...}`
- `GenerateCommand.readStdinIfAvailable()` checks `stdin.isTTY` (false = piped from hook)
- When from hook: uses `transcript_path` directly, auto-opens browser, no console output
- Hook cannot output to console (runs after session closes), hence HTML + browser approach

**ccusage Data Format**

- Actual field names are camelCase: `sessionId`, `inputTokens`, `modelBreakdowns`, etc.
- Session IDs are complex; display names differ from actual IDs
- `projectPath` format: `"project-name/actual-session-id"` - split to get session ID
- Only sessions with valid `projectPath` (not "Unknown Project") are usable

**File Naming**

- HTML files use session slug (e.g., `quirky-crafting-floyd.html`), not session ID
- Session slug comes from first user message in transcript JSONL
- Fallback to session ID if slug unavailable

**Output Modes**

- `--output html`: Save to `~/.claude-receipts/projects/[slug].html`
- `--output console`: Display ASCII art in terminal (default for manual use)
- Hook always uses `--output html` (set during setup)

**Config Philosophy**

- Minimal config: only `version`, optional `location`, optional `timezone`
- No `outputDirectory`, `enablePNG`, `enableConsole`, `format` - simplified after initial design
- Output format specified at command level, not config level

**Visual Design**

- Black & white thermal printer aesthetic (no color backgrounds except dark page background)
- Claude ASCII logo (not "shop" names with emojis)
- "Thank you for building!" (not "shopping")
- Dark page background (#3a3a3a) makes white receipt pop

## Type System

All types in `src/types/`:

- `ccusage.ts` - Matches actual ccusage CLI JSON output (camelCase fields)
- `transcript.ts` - JSONL message structure and parsed summary
- `config.ts` - Minimal user configuration
- `session-hook.ts` - SessionEnd stdin JSON format

## Package Structure

- **ESM only** (`"type": "module"`) - Node 22+ required
- **bin entry**: `bin/claude-receipts.js` imports from `dist/cli.js`
- **Exports**: Main exports from `src/index.ts` for programmatic use
- **Files distributed**: `dist/`, `bin/`, `templates/` (though templates currently unused)

## Known Constraints

- Cannot output to console from SessionEnd hook (terminal already closed)
- ccusage must be installed (bundled as dependency)
- Requires valid `projectPath` from ccusage to find transcript
- Session data has slight delay; ccusage may not have processed most recent session immediately
- Browser auto-open uses platform-specific commands (`open`, `start`, `xdg-open`)

## Hook Installation

Setup command modifies `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx claude-receipts@latest generate --output html"
          }
        ]
      }
    ]
  }
}
```

Always backs up settings.json before modification. Uses `@latest` to ensure users get updates without reinstalling.
