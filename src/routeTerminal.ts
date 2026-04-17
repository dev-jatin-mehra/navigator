import * as vscode from "vscode";
import {
  buildRouteUrl,
  discoverRoutes,
  type RouteDiscoveryOptions,
  type RouteMatch,
} from "./routeDiscovery";
import {
  ANSI_BLUE,
  ANSI_GREEN,
  ANSI_ORANGE,
  colorText,
  renderInstructionBox,
  renderTitleLines,
} from "./routeTerminalTheme";
import { RouteTerminalStartup } from "./routeTerminalStartup";

export class RouteExposerTerminal implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  readonly onDidWrite = this.writeEmitter.event;

  private readonly closeEmitter = new vscode.EventEmitter<void>();
  readonly onDidClose = this.closeEmitter.event;

  private readonly nameEmitter = new vscode.EventEmitter<string>();
  readonly onDidChangeName = this.nameEmitter.event;

  private readonly routeSelectionPattern = /^\d+$/;
  private commandBuffer = "";
  private routes: RouteMatch[] = [];
  private port = 5173;
  private startCommand = "npm run dev";
  private awaitingPortInput = false;
  private loading = false;
  private disposed = false;
  private startupController: RouteTerminalStartup | undefined;

  constructor(
    private readonly workspaceRoot: vscode.WorkspaceFolder | undefined,
    private readonly options: RouteDiscoveryOptions & {
      readonly defaultPort?: number;
      readonly startCommand?: string;
    } = {},
  ) {}

  open(): void {
    if (typeof this.options.defaultPort === "number") {
      this.port = this.options.defaultPort;
    }

    if (typeof this.options.startCommand === "string") {
      this.startCommand = this.options.startCommand;
    }

    this.renderBanner();
    void this.bootstrap();
  }

  close(): void {
    this.disposed = true;
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
    this.nameEmitter.dispose();
  }

  async refresh(initialRender = false): Promise<void> {
    if (this.loading || this.disposed) {
      return;
    }

    this.loading = true;

    try {
      if (!this.workspaceRoot) {
        this.writeln("No workspace folder is open.");
        this.writeln("Open a React app workspace and run the command again.");
        return;
      }

      if (initialRender) {
        this.writeln(colorText("Scanning React Router files...", ANSI_ORANGE));
        this.writeln("");
      }

      this.routes = await discoverRoutes(this.options);
      this.renderRoutes();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.writeln(`Failed to scan routes: ${message}`);
    } finally {
      this.loading = false;
      this.renderPrompt();
    }
  }

  handleInput(data: string): void {
    for (const char of data) {
      if (char === "\u0003") {
        this.writeln("^C");
        this.closeEmitter.fire();
        return;
      }

      if (char === "\r" || char === "\n") {
        const command = this.commandBuffer.trim();
        this.commandBuffer = "";
        this.writeln("");

        if (this.startupController) {
          void this.startupController.handleInput(command);
          continue;
        }

        void this.runCommand(command);
        continue;
      }

      if (char === "\u007F") {
        if (this.commandBuffer.length > 0) {
          this.commandBuffer = this.commandBuffer.slice(0, -1);
          this.writeEmitter.fire("\b \b");
        }
        continue;
      }

      this.commandBuffer += char;
      this.writeEmitter.fire(char);
    }
  }

  private async runCommand(command: string): Promise<void> {
    if (!command) {
      this.renderPrompt();
      return;
    }

    if (this.awaitingPortInput) {
      const parsedPort = Number.parseInt(command, 10);
      if (Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort < 65536) {
        this.port = parsedPort;
        this.awaitingPortInput = false;
        this.writeln(`Using localhost:${this.port}`);
        this.renderRoutes();
      } else {
        this.writeln(`Invalid port: ${command}`);
      }

      this.renderPrompt();
      return;
    }

    if (this.routeSelectionPattern.test(command)) {
      const selectedRoute = this.routes[Number.parseInt(command, 10) - 1];
      if (!selectedRoute) {
        this.writeln(`No route found for ${command}.`);
        this.renderPrompt();
        return;
      }

      await this.openRoute(selectedRoute);
      this.renderPrompt();
      return;
    }

    const [head, ...tail] = command.split(/\s+/);
    const rest = tail.join(" ").trim();

    switch (head.toLowerCase()) {
      case "help":
      case "h":
        this.renderHelp();
        break;
      case "default":
      case "d":
        this.port = 5173;
        this.awaitingPortInput = false;
        this.writeln(colorText("Using default port 5173.", ANSI_BLUE));
        this.renderRoutes();
        break;
      case "manual":
      case "m":
        this.awaitingPortInput = true;
        this.write(colorText("Enter a custom port: ", ANSI_ORANGE));
        return;
      case "port":
      case "p": {
        const parsedPort = Number.parseInt(rest, 10);
        if (
          Number.isFinite(parsedPort) &&
          parsedPort > 0 &&
          parsedPort < 65536
        ) {
          this.port = parsedPort;
          this.awaitingPortInput = false;
          this.writeln(colorText(`Using localhost:${this.port}`, ANSI_BLUE));
          this.renderRoutes();
        } else {
          this.writeln(`Invalid port: ${rest || command}`);
        }
        break;
      }
      case "refresh":
      case "r":
        await this.refresh();
        return;
      case "open":
      case "o": {
        const selectedRoute = this.routes[Number.parseInt(rest, 10) - 1];
        if (!selectedRoute) {
          this.writeln(`No route found for ${rest || command}.`);
        } else {
          await this.openRoute(selectedRoute);
        }
        break;
      }
      case "quit":
      case "q":
        this.closeEmitter.fire();
        return;
      default:
        this.writeln(`Unknown command: ${command}`);
        this.renderHelp();
        break;
    }

    this.renderPrompt();
  }

  private async bootstrap(): Promise<void> {
    if (!this.workspaceRoot) {
      this.writeln("No workspace folder is open.");
      this.writeln("Open a React app workspace and run the command again.");
      this.closeEmitter.fire();
      return;
    }

    this.startupController = new RouteTerminalStartup({
      workspaceRoot: this.workspaceRoot,
      port: this.port,
      startCommand: this.startCommand,
      onWrite: (text) => this.write(text),
      onLine: (text) => this.writeln(text),
      onClose: () => this.closeEmitter.fire(),
      onStarted: async () => {
        this.startupController = undefined;
        await this.refresh(true);
      },
    });

    await this.startupController.bootstrap();
  }

  private renderRoutes(): void {
    this.writeln("");
    this.writeln(
      colorText(
        `Detected ${this.routes.length} route${this.routes.length === 1 ? "" : "s"}.`,
        ANSI_BLUE,
      ),
    );
    this.writeln(
      colorText(`Current host: http://localhost:${this.port}`, ANSI_ORANGE),
    );
    this.writeln("");

    if (this.routes.length === 0) {
      this.writeln("No React Router routes were found in the workspace.");
      this.writeln(
        "Try again after adding <Route /> definitions or route objects.",
      );
      return;
    }

    this.writeln(colorText("Routes:", ANSI_GREEN));
    this.routes.forEach((route, index) => {
      const url = buildRouteUrl(this.port, route.path);
      this.writeln(`${String(index + 1).padStart(2, " ")}. ${url}`);
    });

    this.writeln("");
    this.writeln(
      colorText(
        "Tip: type a route number to open it, or Ctrl+click a URL.",
        ANSI_ORANGE,
      ),
    );
  }

  private renderHelp(): void {
    this.writeln(colorText("Commands:", ANSI_BLUE));
    this.writeln(colorText("  d or default   use localhost:5173", ANSI_ORANGE));
    this.writeln(
      colorText("  m or manual    enter a custom port", ANSI_ORANGE),
    );
    this.writeln(
      colorText("  p <port>       set the port directly", ANSI_ORANGE),
    );
    this.writeln(
      colorText("  r or refresh   rescan the workspace", ANSI_ORANGE),
    );
    this.writeln(
      colorText("  <number>       open that route in the browser", ANSI_ORANGE),
    );
    this.writeln(
      colorText("  o <number>     open that route in the browser", ANSI_ORANGE),
    );
    this.writeln(colorText("  q or quit      close the terminal", ANSI_ORANGE));
  }

  private renderPrompt(): void {
    if (this.disposed) {
      return;
    }

    this.write(colorText("navigator> ", ANSI_BLUE));
  }

  private async openRoute(route: RouteMatch): Promise<void> {
    const url = buildRouteUrl(this.port, route.path);
    this.writeln(`Opening ${url}`);
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private write(text: string): void {
    if (this.disposed) {
      return;
    }

    this.writeEmitter.fire(text);
  }

  private writeln(text: string): void {
    this.write(`${text}\r\n`);
  }

  private renderBanner(): void {
    renderTitleLines((text) => this.writeln(text));
    renderInstructionBox(this.writeln.bind(this), [
      "If there is any backend in this project, please start it now.",
      "Note: this extension may not work well with routes that use query parameters.",
    ]);
  }
}
