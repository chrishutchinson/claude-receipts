import { createConnection } from "net";
import { exec } from "child_process";
import { promisify } from "util";
import type { ReceiptData } from "./receipt-generator.js";
import {
  formatCurrency,
  formatNumber,
  formatDateTime,
} from "../utils/formatting.js";

const execAsync = promisify(exec);

const WIDTH = 40; // TM-T88V 80mm paper, Font A minus margin
const LEFT_MARGIN_DOTS = 12; // 1 character width at 203 dpi

const REPO_URL = "https://github.com/chrishutchinson/claude-receipts";

// Epson USB vendor ID
const EPSON_VENDOR_ID = 0x04b8;
// TM-T88V product ID
const TM_T88V_PRODUCT_ID = 0x0202;

// ESC/POS command constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// CP437 block characters (raw byte values — not UTF-8)
const BLK = 0xdb; // █ full block
const UPH = 0xdf; // ▀ upper half block
const LFH = 0xdd; // ▌ left half block
const RHF = 0xde; // ▐ right half block

/** Tiny buffer builder for ESC/POS byte sequences. */
class EscPosBuilder {
  private chunks: Buffer[] = [];

  /** Append raw bytes. */
  raw(...bytes: number[]): this {
    this.chunks.push(Buffer.from(bytes));
    return this;
  }

  /** Append a UTF-8 string (no newline). */
  text(s: string): this {
    this.chunks.push(Buffer.from(s, "utf-8"));
    return this;
  }

  /** Append a string followed by LF. */
  line(s: string = ""): this {
    return this.text(s).raw(LF);
  }

  /** ESC @ — initialize printer. */
  init(): this {
    return this.raw(ESC, 0x40);
  }

  /** GS L nL nH — set left margin in motion units (1/203 inch). */
  leftMargin(dots: number): this {
    return this.raw(GS, 0x4c, dots & 0xff, (dots >> 8) & 0xff);
  }

  /**
   * Print the Claude logo using CP437 block characters.
   * 5-row character: solid head, eyes, wider arms, solid body, legs.
   */
  logo(): this {
    this.align("center");
    // Row 1 (solid head):  ▐██████████▌
    this.raw(RHF, BLK, BLK, BLK, BLK, BLK, BLK, BLK, BLK, BLK, BLK, LFH, LF);
    // Row 2 (eyes):        ██ ██ ██
    this.raw(RHF, BLK, BLK, 0x20, BLK, BLK, BLK, BLK, 0x20, BLK, BLK, LFH, LF);
    // Row 3 (arms, wider): ▐████████▌
    this.raw(
      RHF,
      BLK,
      BLK,
      BLK,
      BLK,
      BLK,
      BLK,
      BLK,
      BLK,
      BLK,
      BLK,
      BLK,
      BLK,
      BLK,
      BLK,
      LFH,
      LF,
    );
    // Row 4 (solid body):  ▐██████▌
    this.raw(RHF, BLK, BLK, BLK, BLK, BLK, BLK, BLK, BLK, BLK, BLK, LFH, LF);
    // Row 5 (legs):         ▀▀  ▀▀
    this.raw(UPH, 0x20, UPH, 0x20, 0x20, UPH, 0x20, UPH, LF);
    return this;
  }

  /** ESC E n — bold on/off. */
  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  /** ESC a n — alignment (0=left, 1=center, 2=right). */
  align(mode: "left" | "center" | "right"): this {
    const n = mode === "left" ? 0 : mode === "center" ? 1 : 2;
    return this.raw(ESC, 0x61, n);
  }

  /**
   * ESC ! n — select print mode.
   *   bit 3 = double height, bit 4 = double width, bit 5 = bold
   *   0x00 = normal, 0x30 = double-height + double-width
   */
  printMode(n: number): this {
    return this.raw(ESC, 0x21, n);
  }

  /** Convenience: double-height + double-width text. */
  doubleSize(): this {
    return this.printMode(0x30);
  }

  /** Convenience: reset to normal size. */
  normalSize(): this {
    return this.printMode(0x00);
  }

  /** Print a full line of a repeated character. */
  drawLine(char: string = "="): this {
    return this.line(char.repeat(WIDTH));
  }

  /** Print a two-column row: left-aligned label, right-aligned value. */
  leftRight(left: string, right: string): this {
    const gap = WIDTH - left.length - right.length;
    if (gap < 1) {
      return this.line(`${left} ${right}`);
    }
    return this.line(`${left}${" ".repeat(gap)}${right}`);
  }

  /**
   * QR code via GS ( k commands (Epson model 2).
   *   1) Select model 2
   *   2) Set cell size
   *   3) Set error correction (M)
   *   4) Store data
   *   5) Print stored data
   */
  qrCode(data: string, cellSize: number = 6): this {
    const d = Buffer.from(data, "utf-8");

    // Function 165 — select QR model 2
    this.raw(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 50, 0);
    // Function 167 — set cell size
    this.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, cellSize);
    // Function 169 — error correction level M (49)
    this.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 49);
    // Function 180 — store data
    const storeLen = d.length + 3;
    this.raw(
      GS,
      0x28,
      0x6b,
      storeLen & 0xff,
      (storeLen >> 8) & 0xff,
      0x31,
      0x50,
      0x30,
    );
    this.chunks.push(d);
    // Function 181 — print
    this.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30);

    return this;
  }

  /** GS V 66 3 — partial cut with feed. */
  partialCut(): this {
    return this.raw(GS, 0x56, 0x42, 3);
  }

  /** Return the complete buffer. */
  build(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

export class ThermalPrinterRenderer {
  /**
   * Print a receipt to a thermal printer.
   *
   * Supported interface formats:
   *   - "tcp://host:port" — send via TCP socket
   *   - "usb" — auto-detect Epson TM-T88V via libusb
   *   - "usb:VID:PID" — specific USB vendor/product ID (hex)
   *   - anything else — treated as a CUPS printer name
   */
  async printReceipt(
    data: ReceiptData,
    printerInterface: string,
    shareUrl?: string,
  ): Promise<void> {
    const buffer = this.buildReceipt(data, shareUrl);

    if (printerInterface.startsWith("tcp://")) {
      await this.sendViaTcp(buffer, printerInterface);
    } else if (
      printerInterface === "usb" ||
      printerInterface.startsWith("usb:")
    ) {
      await this.sendViaUsb(buffer, printerInterface);
    } else {
      await this.sendViaCups(buffer, printerInterface);
    }
  }

  /**
   * Build the full ESC/POS receipt buffer.
   */
  private buildReceipt(data: ReceiptData, shareUrl?: string): Buffer {
    const b = new EscPosBuilder();

    b.init();
    b.leftMargin(LEFT_MARGIN_DOTS);

    // --- Header ---
    b.logo();
    b.line();

    // --- Info ---
    b.align("center");
    b.line(`Location: ${data.location}`);
    b.line(`Session: ${data.transcriptData.sessionSlug}`);
    b.line(formatDateTime(data.transcriptData.endTime, data.config.timezone));
    b.line();

    // --- Model breakdowns ---
    b.align("left");
    b.drawLine();

    if (
      data.sessionData.modelBreakdowns &&
      data.sessionData.modelBreakdowns.length > 0
    ) {
      for (const model of data.sessionData.modelBreakdowns) {
        // Model name with its cost
        b.bold(true);
        b.leftRight(
          this.getModelName(model.modelName),
          formatCurrency(model.cost),
        );
        b.bold(false);
        b.drawLine("-");

        // Token counts (no prices)
        b.leftRight("  Input tokens", formatNumber(model.inputTokens));
        b.leftRight("  Output tokens", formatNumber(model.outputTokens));

        if (model.cacheCreationTokens && model.cacheCreationTokens > 0) {
          b.leftRight("  Cache write", formatNumber(model.cacheCreationTokens));
        }

        if (model.cacheReadTokens && model.cacheReadTokens > 0) {
          b.leftRight("  Cache read", formatNumber(model.cacheReadTokens));
        }

        b.line();

        b.drawLine();
      }
    }

    // --- Total ---
    b.bold(true);
    b.leftRight("TOTAL", formatCurrency(data.sessionData.totalCost));
    b.bold(false);
    b.drawLine();
    b.line();

    // --- Footer ---
    b.align("left");
    b.line(`CASHIER: ${this.getMainModel(data.sessionData)}`);
    b.line();
    b.align("center");
    b.line("Thank you for building!");
    b.line();

    // --- Repo QR code ---
    b.align("center");
    b.line("Print your own Claude receipts:");
    b.qrCode(REPO_URL, 4);
    b.line("github.com/chrishutchinson");
    b.line("/claude-receipts");
    b.line();

    // --- Cut ---
    b.partialCut();

    return b.build();
  }

  /**
   * Send buffer to a network printer via TCP.
   */
  private sendViaTcp(buffer: Buffer, address: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(address);
      const host = url.hostname;
      const port = parseInt(url.port || "9100", 10);

      const socket = createConnection({ host, port }, () => {
        socket.end(buffer, () => {
          resolve();
        });
      });

      socket.on("error", (err) => {
        reject(new Error(`TCP printer connection failed: ${err.message}`));
      });
    });
  }

  /**
   * Send buffer directly to a USB printer via libusb.
   *
   * @param buffer ESC/POS data
   * @param spec "usb" for auto-detect, or "usb:VID:PID" for specific device
   */
  private async sendViaUsb(buffer: Buffer, spec: string): Promise<void> {
    const { findByIds, getDeviceList, OutEndpoint } = await import("usb");

    let vid = EPSON_VENDOR_ID;
    let pid = TM_T88V_PRODUCT_ID;

    // Parse "usb:VID:PID" if provided
    if (spec.startsWith("usb:")) {
      const parts = spec.split(":");
      if (parts.length >= 3) {
        vid = parseInt(parts[1], 16);
        pid = parseInt(parts[2], 16);
      }
    }

    const device = findByIds(vid, pid);
    if (!device) {
      // List what USB devices we can see to help debug
      const devices = getDeviceList();
      const summary = devices
        .slice(0, 10)
        .map(
          (d) =>
            `  ${d.deviceDescriptor.idVendor.toString(16)}:${d.deviceDescriptor.idProduct.toString(16)}`,
        )
        .join("\n");

      throw new Error(
        `USB printer not found (looking for ${vid.toString(16)}:${pid.toString(16)}).\n` +
          `Visible USB devices:\n${summary || "  (none)"}`,
      );
    }

    device.open();

    try {
      const iface = device.interface(0);

      // Detach kernel driver if active (e.g. macOS claiming the device)
      if (iface.isKernelDriverActive()) {
        iface.detachKernelDriver();
      }

      iface.claim();

      // Find the OUT endpoint (bulk transfer to printer)
      const outEndpoint = iface.endpoints.find(
        (ep): ep is InstanceType<typeof OutEndpoint> =>
          ep instanceof OutEndpoint,
      );

      if (!outEndpoint) {
        throw new Error(
          "No OUT endpoint found on USB interface 0. " +
            `Endpoints: ${iface.endpoints.map((e) => `${e.address} (${e.direction})`).join(", ")}`,
        );
      }

      // Send the data
      await outEndpoint.transferAsync(buffer);

      await iface.releaseAsync();
    } finally {
      device.close();
    }
  }

  /**
   * Send raw ESC/POS buffer to a CUPS printer via `lp`.
   */
  private async sendViaCups(
    buffer: Buffer,
    printerName: string,
  ): Promise<void> {
    // Verify the CUPS destination exists before attempting to print.
    // `lp` gives a misleading "No such file or directory" when the
    // printer name doesn't match any CUPS destination.
    try {
      await execAsync(`lpstat -p "${printerName}"`);
    } catch {
      let available = "";
      try {
        const { stdout } = await execAsync("lpstat -p");
        const names = stdout
          .split("\n")
          .filter((l) => l.startsWith("printer "))
          .map((l) => l.split(" ")[1]);
        if (names.length > 0) {
          available = `\nAvailable printers: ${names.join(", ")}`;
        }
      } catch {
        // lpstat itself failed — no CUPS printers at all
      }

      throw new Error(
        `Printer "${printerName}" not found in CUPS.${available || "\nNo printers are configured. Add one via System Settings > Printers & Scanners."}`,
      );
    }

    const { writeFile, unlink } = await import("fs/promises");
    const { join } = await import("path");
    const { tmpdir } = await import("os");

    const tmpFile = join(tmpdir(), `claude-receipt-${Date.now()}.bin`);

    try {
      await writeFile(tmpFile, buffer);
      await execAsync(`lp -d "${printerName}" -o raw "${tmpFile}"`);
    } finally {
      try {
        await unlink(tmpFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private getModelName(model: string): string {
    const cleaned = model.replace(/-\d{8}$/, "");

    const modelMap: Record<string, string> = {
      "claude-sonnet-4-5": "Claude Sonnet 4.5",
      "claude-opus-4-5": "Claude Opus 4.5",
      "claude-3-5-sonnet": "Claude 3.5 Sonnet",
      "claude-3-opus": "Claude 3 Opus",
      "claude-3-haiku": "Claude 3 Haiku",
    };

    return modelMap[cleaned] || model;
  }

  private getMainModel(sessionData: ReceiptData["sessionData"]): string {
    if (sessionData.modelBreakdowns && sessionData.modelBreakdowns.length > 0) {
      return this.getModelName(sessionData.modelBreakdowns[0].modelName);
    }

    if (sessionData.modelsUsed && sessionData.modelsUsed.length > 0) {
      return this.getModelName(sessionData.modelsUsed[0]);
    }

    return "Claude";
  }
}
