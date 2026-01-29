import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import type { ReceiptConfig } from "../types/config.js";
import { DEFAULT_CONFIG } from "../types/config.js";

export class ConfigManager {
  private configPath: string;

  constructor() {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    this.configPath = join(home, ".claude-receipts.config.json");
  }

  /**
   * Load configuration from file or return defaults
   */
  async loadConfig(): Promise<ReceiptConfig> {
    if (!existsSync(this.configPath)) {
      return DEFAULT_CONFIG;
    }

    try {
      const content = await readFile(this.configPath, "utf-8");
      const config = JSON.parse(content);

      // Merge with defaults to ensure all fields exist
      return { ...DEFAULT_CONFIG, ...config };
    } catch (error) {
      console.warn("Failed to parse config file, using defaults");
      return DEFAULT_CONFIG;
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfig(config: ReceiptConfig): Promise<void> {
    const configDir = join(this.configPath, "..");

    // Ensure directory exists
    if (!existsSync(configDir)) {
      await mkdir(configDir, { recursive: true });
    }

    await writeFile(this.configPath, JSON.stringify(config, null, 2), "utf-8");
  }

  /**
   * Update a specific config value
   */
  async updateConfig(key: keyof ReceiptConfig, value: unknown): Promise<void> {
    const config = await this.loadConfig();
    (config as any)[key] = value;
    await this.saveConfig(config);
  }

  /**
   * Reset config to defaults
   */
  async resetConfig(): Promise<void> {
    await this.saveConfig(DEFAULT_CONFIG);
  }

  /**
   * Get the config file path
   */
  getConfigPath(): string {
    return this.configPath;
  }
}
