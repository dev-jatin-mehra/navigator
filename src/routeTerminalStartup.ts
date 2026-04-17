import * as http from "node:http";
import * as net from "node:net";
import * as path from "node:path";
import { existsSync } from "node:fs";
import * as vscode from "vscode";
import { ANSI_BLUE, ANSI_ORANGE, colorText } from "./routeTerminalTheme";

export type StartupState = "idle" | "await-run-confirm" | "await-subfolder";

export interface StartupOptions {
  readonly workspaceRoot: vscode.WorkspaceFolder;
  readonly port: number;
  readonly startCommand: string;
  readonly onWrite: (text: string) => void;
  readonly onLine: (text: string) => void;
  readonly onClose: () => void;
  readonly onStarted: () => Promise<void>;
}

export class RouteTerminalStartup {
  private readonly appStartupTimeoutMs = 60000;
  private readonly appStartupPollIntervalMs = 1000;
  private appRunnerTerminal: vscode.Terminal | undefined;
  private startupState: StartupState = "idle";

  constructor(private readonly options: StartupOptions) {}

  async bootstrap(): Promise<void> {
    this.options.onLine(
      colorText(`Workspace: ${this.options.workspaceRoot.name}`, ANSI_BLUE),
    );
    this.options.onLine(
      colorText(
        `Checking app on http://localhost:${this.options.port} ...`,
        ANSI_ORANGE,
      ),
    );

    const appRunning = await this.isLocalhostRunning(this.options.port);
    if (appRunning) {
      this.options.onLine(
        colorText("React app detected. Loading routes...", ANSI_BLUE),
      );
      await this.options.onStarted();
      return;
    }

    this.options.onLine(colorText("React app is not running.", ANSI_ORANGE));
    this.options.onLine(
      colorText(
        `Start it from here using "${this.options.startCommand}"? (y/n)`,
        ANSI_BLUE,
      ),
    );
    this.startupState = "await-run-confirm";
    this.options.onWrite(colorText("startup> ", ANSI_ORANGE));
  }

  async handleInput(input: string): Promise<boolean> {
    if (this.startupState === "await-run-confirm") {
      const normalized = input.toLowerCase();

      if (normalized === "y" || normalized === "yes") {
        this.startupState = "await-subfolder";
        this.options.onLine(
          colorText(
            "Any subfolder? Enter its name (press Enter for workspace root).",
            ANSI_BLUE,
          ),
        );
        this.options.onWrite(colorText("subfolder> ", ANSI_ORANGE));
        return true;
      }

      if (normalized === "n" || normalized === "no") {
        this.options.onLine(
          colorText(
            `Please run the application using "${this.options.startCommand}" and re-activate the extension again.`,
            ANSI_ORANGE,
          ),
        );
        this.options.onLine(colorText("Closing in 10 seconds...", ANSI_ORANGE));
        await this.delay(10000);
        this.options.onClose();
        return true;
      }

      this.options.onLine(colorText("Please answer with y/n.", ANSI_ORANGE));
      this.options.onWrite(colorText("startup> ", ANSI_ORANGE));
      return true;
    }

    if (this.startupState !== "await-subfolder") {
      return false;
    }

    const subfolder = input.trim();
    const workspaceRootPath = path.resolve(
      this.options.workspaceRoot.uri.fsPath,
    );
    const targetCwd = subfolder
      ? path.resolve(workspaceRootPath, subfolder)
      : workspaceRootPath;

    if (!this.isInsideWorkspace(workspaceRootPath, targetCwd)) {
      this.options.onLine(
        colorText(
          "Subfolder must stay inside the current workspace.",
          ANSI_ORANGE,
        ),
      );
      this.options.onWrite(colorText("subfolder> ", ANSI_ORANGE));
      return true;
    }

    if (!existsSync(targetCwd)) {
      this.options.onLine(
        colorText(`Subfolder not found: ${subfolder}`, ANSI_ORANGE),
      );
      this.options.onWrite(colorText("subfolder> ", ANSI_ORANGE));
      return true;
    }

    const startedInVsCodeTerminal = this.startAppInVsCodeTerminal(targetCwd);
    if (!startedInVsCodeTerminal) {
      this.options.onLine(
        colorText(
          `Failed to run "${this.options.startCommand}" in VS Code terminal.`,
          ANSI_ORANGE,
        ),
      );
      this.options.onClose();
      return true;
    }

    this.options.onLine(
      colorText(
        `Started "${this.options.startCommand}" in VS Code terminal at ${targetCwd}`,
        ANSI_BLUE,
      ),
    );
    this.options.onLine(
      colorText(
        `Waiting for app on localhost:${this.options.port} ...`,
        ANSI_ORANGE,
      ),
    );

    const started = await this.waitForLocalhost(
      this.options.port,
      this.appStartupTimeoutMs,
      this.appStartupPollIntervalMs,
      true,
    );
    if (!started) {
      this.options.onLine(
        colorText(
          `Could not detect app on localhost:${this.options.port}. Please run "${this.options.startCommand}" manually, then re-activate the extension.`,
          ANSI_ORANGE,
        ),
      );
      this.options.onClose();
      return true;
    }

    this.startupState = "idle";
    this.options.onLine(
      colorText("React app detected. Loading routes...", ANSI_BLUE),
    );
    await this.options.onStarted();
    return true;
  }

  private async isLocalhostRunning(port: number): Promise<boolean> {
    const hosts = ["127.0.0.1", "localhost", "::1"];

    for (const host of hosts) {
      if (await this.isPortOpen(host, port, 1200)) {
        return true;
      }
    }

    return false;
  }

  private async waitForLocalhost(
    port: number,
    timeoutMs: number,
    intervalMs: number,
    showProgress = false,
  ): Promise<boolean> {
    const endAt = Date.now() + timeoutMs;
    let elapsedMs = 0;

    while (Date.now() < endAt) {
      if (await this.isLocalhostRunning(port)) {
        return true;
      }

      elapsedMs += intervalMs;
      if (showProgress && elapsedMs % 5000 === 0) {
        this.options.onLine(
          colorText(
            `Still waiting... ${Math.floor(elapsedMs / 1000)}s`,
            ANSI_ORANGE,
          ),
        );
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    if (showProgress) {
      this.options.onLine(
        colorText(
          `Waited ${Math.floor(timeoutMs / 1000)}s and app was not detected.`,
          ANSI_ORANGE,
        ),
      );
    }

    return false;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isInsideWorkspace(
    workspaceRootPath: string,
    targetCwd: string,
  ): boolean {
    const normalizedRoot = path.resolve(workspaceRootPath);
    const normalizedTarget = path.resolve(targetCwd);

    return (
      normalizedTarget === normalizedRoot ||
      normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)
    );
  }

  private async isPortOpen(
    host: string,
    port: number,
    timeoutMs: number,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (result: boolean): void => {
        if (settled) {
          return;
        }

        settled = true;
        socket.destroy();
        resolve(result);
      };

      socket.setTimeout(timeoutMs);
      socket.once("connect", () => finish(true));
      socket.once("timeout", () => finish(false));
      socket.once("error", () => finish(false));
      socket.connect(port, host);
    });
  }

  private startAppInVsCodeTerminal(cwd: string): boolean {
    try {
      this.appRunnerTerminal = vscode.window.createTerminal({
        name: "Navigator App Runner",
        cwd,
      });

      this.appRunnerTerminal.show(true);
      this.appRunnerTerminal.sendText(this.options.startCommand, true);
      return true;
    } catch {
      return false;
    }
  }
}
