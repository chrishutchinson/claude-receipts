import geoip from "geoip-lite";
import { readFile } from "fs/promises";
import type { ReceiptConfig } from "../types/config.js";

export class LocationDetector {
  /**
   * Get location string from config or geolocation
   */
  async getLocation(config: ReceiptConfig): Promise<string> {
    // Priority 1: Config file
    if (config.location) {
      return config.location;
    }

    // Priority 2: IP geolocation (offline)
    try {
      const location = await this.detectLocationFromIP();
      if (location) {
        return location;
      }
    } catch (error) {
      // Silent fail, use fallback
    }

    // Priority 3: Fallback
    return "The Cloud";
  }

  /**
   * Detect location from public IP using geoip-lite
   */
  private async detectLocationFromIP(): Promise<string | null> {
    try {
      // Get public IP from a simple service
      const ip = await this.getPublicIP();
      if (!ip) return null;

      const geo = geoip.lookup(ip);
      if (geo && geo.city && geo.region) {
        return `${geo.city}, ${geo.region}`;
      }

      if (geo && geo.country) {
        return geo.country;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get public IP address
   */
  private async getPublicIP(): Promise<string | null> {
    try {
      // Use a simple IP detection service
      const response = await fetch("https://api.ipify.org?format=text", {
        signal: AbortSignal.timeout(3000), // 3 second timeout
      });

      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }
}
