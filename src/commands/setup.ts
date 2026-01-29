import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import prompts from "prompts";
import ora from "ora";
import { ConfigManager } from "../core/config-manager.js";
import type { ReceiptConfig } from "../types/config.js";

interface ClaudeSettings {
  hooks?: {
    SessionEnd?: Array<{
      hooks: Array<{
        type: string;
        command: string;
      }>;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface SetupOptions {
  uninstall?: boolean;
}

export class SetupCommand {
  private configManager = new ConfigManager();
  private settingsPath: string;

  constructor() {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    this.settingsPath = join(home, ".claude", "settings.json");
  }

  async execute(options: SetupOptions): Promise<void> {
    console.log(chalk.cyan.bold("\nClaude Receipts Setup\n"));

    try {
      if (options.uninstall) {
        await this.uninstall();
      } else {
        await this.install();
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`\nError: ${error.message}`));
      } else {
        console.error(chalk.red("\nAn unknown error occurred"));
      }
      process.exit(1);
    }
  }

  /**
   * Install the SessionEnd hook
   */
  private async install(): Promise<void> {
    // Prompt user for configuration
    const answers = await prompts([
      {
        type: "text",
        name: "location",
        message: "Default location (leave blank to auto-detect):",
        initial: "",
      },
    ]);

    // User cancelled
    if (answers.location === undefined) {
      console.log(chalk.yellow("\nSetup cancelled"));
      return;
    }

    const spinner = ora("Setting up hook...").start();

    try {
      // Create config
      const config: ReceiptConfig = {
        version: "1.0.0",
        location: answers.location || undefined,
      };

      await this.configManager.saveConfig(config);
      spinner.text = "Config saved...";

      // Modify settings.json
      await this.addHookToSettings();
      spinner.text = "Hook installed...";

      spinner.succeed("Setup complete!");

      console.log(chalk.green("\n✓ SessionEnd hook installed"));
      console.log(
        chalk.gray(`  Receipts will be saved to: ~/.claude-receipts/projects/`),
      );
      console.log(
        chalk.gray(`  Config file: ${this.configManager.getConfigPath()}\n`),
      );
      console.log(
        chalk.cyan(
          "HTML receipts will now open in your browser when you exit Claude Code sessions!\n",
        ),
      );
    } catch (error) {
      spinner.fail("Setup failed");
      throw error;
    }
  }

  /**
   * Uninstall the SessionEnd hook
   */
  private async uninstall(): Promise<void> {
    const spinner = ora("Removing hook...").start();

    try {
      await this.removeHookFromSettings();
      spinner.succeed("Hook removed!");

      console.log(chalk.green("\n✓ SessionEnd hook uninstalled"));
      console.log(
        chalk.gray(
          '  Config file preserved. Use "config --reset" to reset it.\n',
        ),
      );
    } catch (error) {
      spinner.fail("Uninstall failed");
      throw error;
    }
  }

  /**
   * Add the SessionEnd hook to settings.json
   */
  private async addHookToSettings(): Promise<void> {
    // Ensure .claude directory exists
    const claudeDir = join(this.settingsPath, "..");
    if (!existsSync(claudeDir)) {
      await mkdir(claudeDir, { recursive: true });
    }

    // Read existing settings
    let settings: ClaudeSettings = {};

    if (existsSync(this.settingsPath)) {
      // Backup existing settings
      const backupPath = `${this.settingsPath}.backup`;
      const content = await readFile(this.settingsPath, "utf-8");
      await writeFile(backupPath, content, "utf-8");

      try {
        settings = JSON.parse(content);
      } catch {
        throw new Error(
          "Failed to parse existing settings.json. Please check the file format.",
        );
      }
    }

    // Initialize hooks if not present
    if (!settings.hooks) {
      settings.hooks = {};
    }

    if (!settings.hooks.SessionEnd) {
      settings.hooks.SessionEnd = [];
    }

    // Check if our hook already exists
    const hookCommand = "npx claude-receipts@latest generate";
    const existingHook = settings.hooks.SessionEnd.find((h) =>
      h.hooks.some((hook) => hook.command.includes("claude-receipts")),
    );

    if (existingHook) {
      console.log(chalk.yellow("\n⚠ Hook already installed, updating..."));
      // Remove old hook
      settings.hooks.SessionEnd = settings.hooks.SessionEnd.filter(
        (h) =>
          !h.hooks.some((hook) => hook.command.includes("claude-receipts")),
      );
    }

    // Add our hook
    settings.hooks.SessionEnd.push({
      hooks: [
        {
          type: "command",
          command: `${hookCommand} --output html`,
        },
      ],
    });

    // Write settings
    await writeFile(
      this.settingsPath,
      JSON.stringify(settings, null, 2),
      "utf-8",
    );
  }

  /**
   * Remove the SessionEnd hook from settings.json
   */
  private async removeHookFromSettings(): Promise<void> {
    if (!existsSync(this.settingsPath)) {
      throw new Error("settings.json not found. Hook may not be installed.");
    }

    const content = await readFile(this.settingsPath, "utf-8");
    let settings: ClaudeSettings;

    try {
      settings = JSON.parse(content);
    } catch {
      throw new Error("Failed to parse settings.json");
    }

    if (!settings.hooks?.SessionEnd) {
      throw new Error("No SessionEnd hooks found in settings.json");
    }

    // Remove our hook
    settings.hooks.SessionEnd = settings.hooks.SessionEnd.filter(
      (h) => !h.hooks.some((hook) => hook.command.includes("claude-receipts")),
    );

    // Remove SessionEnd array if empty
    if (settings.hooks.SessionEnd.length === 0) {
      delete settings.hooks.SessionEnd;
    }

    // Remove hooks object if empty
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    // Write settings
    await writeFile(
      this.settingsPath,
      JSON.stringify(settings, null, 2),
      "utf-8",
    );
  }
}
