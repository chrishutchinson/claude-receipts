#!/usr/bin/env node

import { Command } from "commander";
import { GenerateCommand } from "./commands/generate.js";
import { ConfigCommand } from "./commands/config.js";
import { SetupCommand } from "./commands/setup.js";

const program = new Command();

program
  .name("claude-receipts")
  .description("Generate quirky, shareable receipts for your Claude Code usage")
  .version("1.0.0");

// Generate command
program
  .command("generate")
  .description("Generate a receipt for a Claude Code session")
  .option("-s, --session <id>", "Specific session ID to generate receipt for")
  .option(
    "-o, --output <format>",
    'Output format: "html" or "console" (default: console)',
    "console",
  )
  .option("-l, --location <text>", "Override location detection")
  .action(async (options) => {
    const command = new GenerateCommand();
    await command.execute(options);
  });

// Config command
program
  .command("config")
  .description("Manage configuration")
  .option("--show", "Display current configuration")
  .option("--set <key=value>", "Set a configuration value")
  .option("--reset", "Reset configuration to defaults")
  .action(async (options) => {
    const command = new ConfigCommand();
    await command.execute(options);
  });

// Setup command
program
  .command("setup")
  .description("Setup automatic receipt generation via SessionEnd hook")
  .option("--uninstall", "Remove the SessionEnd hook")
  .action(async (options) => {
    const command = new SetupCommand();
    await command.execute(options);
  });

// Make generate the default command if no command is specified
if (process.argv.length === 2) {
  process.argv.push("generate");
}

program.parse();
