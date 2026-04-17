import * as vscode from "vscode";
import { RouteExposerTerminal } from "./routeTerminal";

export function activate(context: vscode.ExtensionContext): void {
  const openRouteExposer = vscode.commands.registerCommand(
    "navigator.openRouteExposer",
    () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const configuration = vscode.workspace.getConfiguration("navigator");
      const includePatterns = configuration.get<string[]>("routeFileGlobs");
      const defaultPort = configuration.get<number>("defaultPort");
      const startCommand =
        configuration.get<string>("startCommand") ?? "npm run dev";

      const terminal = vscode.window.createTerminal({
        name: "React Routes",
        pty: new RouteExposerTerminal(workspaceFolder, {
          includePatterns,
          defaultPort,
          startCommand,
        }),
      });

      context.subscriptions.push(terminal);
      terminal.show(true);
    },
  );

  context.subscriptions.push(openRouteExposer);
}

export function deactivate(): void {}
