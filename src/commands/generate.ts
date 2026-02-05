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
import { ThermalPrinterRenderer } from "../core/thermal-printer.js";
import { ConfigManager } from "../core/config-manager.js";
import { LocationDetector } from "../utils/location.js";
import type { SessionEndHookData } from "../types/session-hook.js";
import type { ReceiptData } from "../core/receipt-generator.js";

const execAsync = promisify(exec);

export type OutputFormat = "html" | "console" | "printer";

export interface GenerateOptions {
  session?: string;
  output?: string[];
  location?: string;
  printer?: string;
}

export class GenerateCommand {
  private dataFetcher = new DataFetcher();
  private transcriptParser = new TranscriptParser();
  private receiptGenerator = new ReceiptGenerator();
  private htmlRenderer = new HtmlRenderer();
  private thermalPrinter = new ThermalPrinterRenderer();
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

      let sessionData;
      try {
        if (actualSessionId) {
          // From hook or when we have the full UUID — fetch directly by ID
          // for accurate totals (avoids sub-session slice issue with --breakdown)
          sessionData =
            await this.dataFetcher.fetchSessionById(actualSessionId);
        } else {
          // Manual mode — discover session by prefix/name, then fetch accurate data
          sessionData =
            await this.dataFetcher.fetchSessionData(options.session);
        }
      } catch (err) {
        if (stdinData) {
          // Session not found in ccusage — likely too short or not yet processed.
          // Exit silently rather than generating a receipt for the wrong session.
          spinner.stop();
          return;
        }
        throw err;
      }

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
      const outputFormats = [
        ...new Set(options.output || (isFromHook ? ["html"] : ["console"])),
      ] as OutputFormat[];

      const errors: Array<{ format: OutputFormat; error: Error }> = [];

      for (const format of outputFormats) {
        try {
          switch (format) {
            case "printer":
              await this.outputToPrinter(receiptData, options, config, spinner);
              break;
            case "html":
              await this.outputToHtml(
                receiptData,
                receipt,
                actualSessionId || sessionData.sessionId,
                transcriptData.sessionSlug,
                isFromHook,
              );
              break;
            case "console":
              this.outputToConsole(receipt);
              break;
          }
        } catch (err) {
          const error =
            err instanceof Error ? err : new Error("Unknown error");
          errors.push({ format, error });

          if (outputFormats.length > 1 && !isFromHook) {
            console.log(
              chalk.yellow(
                `\n⚠ ${format} output failed: ${error.message}`,
              ),
            );
          }
        }
      }

      if (errors.length === outputFormats.length) {
        // All outputs failed — throw the first error
        throw errors[0].error;
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
   * Send receipt to thermal printer
   */
  private async outputToPrinter(
    receiptData: ReceiptData,
    options: GenerateOptions,
    config: { printer?: string },
    spinner: ReturnType<typeof ora>,
  ): Promise<void> {
    const printerInterface = options.printer || config.printer;
    if (!printerInterface) {
      throw new Error(
        'No printer specified. Use --printer <name> or set via: claude-receipts config --set printer=EPSON_TM_T88V',
      );
    }

    spinner.start("Sending to printer...");
    await this.thermalPrinter.printReceipt(receiptData, printerInterface);
    spinner.succeed(`Receipt sent to printer: ${printerInterface}`);
  }

  /**
   * Save receipt as HTML and optionally open in browser
   */
  private async outputToHtml(
    receiptData: ReceiptData,
    receipt: string,
    sessionId: string,
    sessionSlug: string | undefined,
    isFromHook: boolean,
  ): Promise<void> {
    const fileName = sessionSlug || sessionId;
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const outputDir = `${home}/.claude-receipts/projects`;
    const fullPath = `${outputDir}/${fileName}.html`;

    const html = this.htmlRenderer.generateHtml(receiptData, receipt);
    await this.saveHtmlFile(html, fullPath);

    if (isFromHook) {
      await this.openInBrowser(fullPath);
    } else {
      console.log(chalk.cyan("\nTip: Open in browser to view!"));
    }
  }

  /**
   * Display receipt to console with formatting
   */
  private outputToConsole(receipt: string): void {
    this.displayToConsole(receipt);
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
