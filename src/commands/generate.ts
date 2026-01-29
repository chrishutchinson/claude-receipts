import { stdin } from "process";
import chalk from "chalk";
import boxen from "boxen";
import ora from "ora";
import { exec } from "child_process";
import { promisify } from "util";
import { DataFetcher } from "../core/data-fetcher.js";
import { TranscriptParser } from "../core/transcript-parser.js";
import { ReceiptGenerator } from "../core/receipt-generator.js";
import { HtmlRenderer } from "../core/html-renderer.js";
import { ConfigManager } from "../core/config-manager.js";
import { LocationDetector } from "../utils/location.js";
import type { SessionEndHookData } from "../types/session-hook.js";

const execAsync = promisify(exec);

export interface GenerateOptions {
  session?: string;
  output?: "html" | "console";
  location?: string;
}

export class GenerateCommand {
  private dataFetcher = new DataFetcher();
  private transcriptParser = new TranscriptParser();
  private receiptGenerator = new ReceiptGenerator();
  private htmlRenderer = new HtmlRenderer();
  private configManager = new ConfigManager();
  private locationDetector = new LocationDetector();

  async execute(options: GenerateOptions): Promise<void> {
    const spinner = ora("Generating receipt...").start();

    try {
      // Check if stdin has data (called from hook)
      const stdinData = await this.readStdinIfAvailable();
      let transcriptPath: string | undefined;
      let actualSessionId: string | undefined;

      if (stdinData) {
        // Called from SessionEnd hook - use the transcript path directly!
        transcriptPath = stdinData.transcript_path;
        actualSessionId = stdinData.session_id;
      }

      // Load config
      const config = await this.configManager.loadConfig();

      // Fetch session data from ccusage
      spinner.text = "Fetching session data...";

      // When called from hook, we need to find the matching session in ccusage
      // When called manually, get the most recent session
      const sessionData = await this.dataFetcher.fetchSessionData();

      // Determine transcript path if not from hook
      if (!transcriptPath) {
        // Try to extract actual session ID from projectPath
        // Format: "project-name/actual-session-id"
        if (
          sessionData.projectPath &&
          sessionData.projectPath !== "Unknown Project"
        ) {
          const parts = sessionData.projectPath.split("/");
          actualSessionId = parts[parts.length - 1]; // Last part is the actual session ID

          const home = process.env.HOME || process.env.USERPROFILE || "";
          transcriptPath = `${home}/.claude/projects/${sessionData.projectPath}.jsonl`;
        } else {
          throw new Error(
            "Cannot determine transcript path. Session has no valid project path.",
          );
        }
      }

      // Parse transcript
      spinner.text = "Parsing transcript...";
      const transcriptData =
        await this.transcriptParser.parseTranscript(transcriptPath);

      // Get location
      const location =
        options.location || (await this.locationDetector.getLocation(config));

      // Generate receipt data
      spinner.text = "Generating receipt...";
      const receiptData = {
        sessionData,
        transcriptData,
        location,
        config,
      };

      const receipt = this.receiptGenerator.generateReceipt(receiptData);

      spinner.succeed("Receipt generated!");

      // Determine if we should output to console and/or file
      const isFromHook = !!stdinData;
      const outputFormat = options.output || (isFromHook ? "html" : "console");

      if (outputFormat === "html") {
        // Generate HTML and save/open
        const fileSessionId = actualSessionId || sessionData.sessionId;
        const fileName = transcriptData.sessionSlug || fileSessionId;

        // Output to ~/.claude-receipts/projects/...
        const home = process.env.HOME || process.env.USERPROFILE || "";
        const outputDir = `${home}/.claude-receipts/projects`;
        const fullPath = `${outputDir}/${fileName}.html`;

        // Generate HTML
        const html = this.htmlRenderer.generateHtml(receiptData, receipt);
        await this.saveHtmlFile(html, fullPath);

        // Open in browser (only auto-open from hook)
        if (isFromHook) {
          await this.openInBrowser(fullPath);
        } else {
          console.log(chalk.cyan("\nTip: Open in browser to view!"));
        }
      } else {
        // Console output
        this.displayToConsole(receipt);
      }
    } catch (error) {
      spinner.fail("Failed to generate receipt");

      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      } else {
        console.error(chalk.red("An unknown error occurred"));
      }

      process.exit(1);
    }
  }

  /**
   * Check if stdin has data and read it
   */
  private async readStdinIfAvailable(): Promise<SessionEndHookData | null> {
    return new Promise((resolve) => {
      // Check if stdin is a TTY (interactive terminal) or piped
      if (stdin.isTTY) {
        resolve(null);
        return;
      }

      let data = "";
      const timeout = setTimeout(() => {
        resolve(null);
      }, 100); // 100ms timeout to avoid hanging

      stdin.setEncoding("utf-8");

      stdin.on("data", (chunk) => {
        data += chunk;
      });

      stdin.on("end", () => {
        clearTimeout(timeout);
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          resolve(null);
        }
      });

      // If no data after timeout, continue without stdin
      stdin.resume();
    });
  }

  /**
   * Display receipt to console with formatting
   */
  private displayToConsole(receipt: string): void {
    console.log(
      boxen(receipt, {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "cyan",
      }),
    );
  }

  /**
   * Save receipt to a file
   */
  private async saveToFile(
    receipt: string,
    outputPath: string,
    sessionId: string,
  ): Promise<void> {
    const { writeFile, mkdir } = await import("fs/promises");
    const { dirname, resolve } = await import("path");

    const resolvedPath = resolve(this.expandPath(outputPath));
    const dir = dirname(resolvedPath);

    // Ensure directory exists
    await mkdir(dir, { recursive: true });

    // Write receipt to file
    await writeFile(resolvedPath, receipt, "utf-8");

    console.log(chalk.green(`Receipt saved to: ${resolvedPath}`));
  }

  /**
   * Save HTML file
   */
  private async saveHtmlFile(html: string, outputPath: string): Promise<void> {
    const { writeFile, mkdir } = await import("fs/promises");
    const { dirname, resolve } = await import("path");

    const resolvedPath = resolve(this.expandPath(outputPath));
    const dir = dirname(resolvedPath);

    // Ensure directory exists
    await mkdir(dir, { recursive: true });

    // Write HTML to file
    await writeFile(resolvedPath, html, "utf-8");

    console.log(chalk.green(`Receipt saved to: ${resolvedPath}`));
  }

  /**
   * Open file in default browser
   */
  private async openInBrowser(filePath: string): Promise<void> {
    const platform = process.platform;

    try {
      if (platform === "darwin") {
        // macOS
        await execAsync(`open "${filePath}"`);
      } else if (platform === "win32") {
        // Windows
        await execAsync(`start "" "${filePath}"`);
      } else {
        // Linux
        await execAsync(`xdg-open "${filePath}"`);
      }
    } catch (error) {
      // Silently fail - file is still saved
      // Can't log error in hook context anyway
    }
  }

  /**
   * Expand ~ to home directory
   */
  private expandPath(path: string): string {
    if (path.startsWith("~/")) {
      const home = process.env.HOME || process.env.USERPROFILE || "";
      return path.replace(/^~/, home);
    }
    return path;
  }
}
