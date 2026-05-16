#!/usr/bin/env node

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Command, Option } from "commander";
import { GenerateCommand } from "./commands/generate.js";
import { ConfigCommand } from "./commands/config.js";
import { SetupCommand } from "./commands/setup.js";

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf-8"));

const program = new Command();

program
  .name("claude-receipts")
  .description("Generate quirky, shareable receipts for your Claude Code usage")
  .version(version);

// Generate command
program
  .command("generate")
  .description("Generate a receipt for a Claude Code session")
  .option("-s, --session <id>", "Specific session ID to generate receipt for")
  .addOption(
    new Option("-o, --output <format...>", "Output format(s): html, console, printer (comma-separated or repeated)")
      .argParser((value: string, prev: string[] | undefined) => {
        const formats = value.split(",").map((s) => s.trim()).filter(Boolean);
        const valid = ["html", "console", "printer"];
        for (const f of formats) {
          if (!valid.includes(f)) {
            throw new Error(`Invalid output format "${f}". Valid formats: ${valid.join(", ")}`);
          }
        }
        return [...(prev || []), ...formats];
      }),
  )
  .option("-l, --location <text>", "Override location detection")
  .option(
    "-p, --printer <interface>",
    'Printer: "usb" (auto-detect), "usb:VID:PID", "tcp://host:port", or CUPS name',
  )
  .addOption(
    new Option(
      "--printermodel <model>",
      "Epson model to target when --printer is 'usb' (selects USB Product ID)",
    ).choices(["t88v", "t88vii"]),
  )
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
