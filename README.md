# Navigator

Navigator is a terminal-based route launcher for React apps. It scans common React Router definitions, lists matching routes as clickable local URLs, and can start the app from inside VS Code when needed.

## Features

- Scans React Router route objects and `<Route />` JSX definitions.
- Shows a terminal-style route exposer from the command palette.
- Uses `localhost:5173` by default, with a manual port option inside the terminal.
- Prints URL-only route entries for quick opening.
- Checks whether the React app is running before loading routes.
- Handles startup prompts entirely inside the Navigator terminal.
- Lets you start the app from a chosen subfolder such as `client`.

## Usage

1. Open your React app workspace in VS Code.
2. Run `Navigator: Open Route Exposer` from the command palette.
3. If your app is not running, Navigator asks in terminal if it should run it from here.
4. If you answer yes, enter an optional subfolder name like `client`, or press Enter for the workspace root.
5. In the terminal, type `d` for the default port or `m` to enter a custom port.
6. Type a route number to open it in the browser, or Ctrl+click the printed URL.

## Settings

This extension contributes the following settings:

- `navigator.defaultPort`: Default port used when the terminal opens. The default is `5173`.
- `navigator.routeFileGlobs`: Glob patterns used to scan for route definitions. The default is `**/*.{ts,tsx,js,jsx}`.
- `navigator.startCommand`: Command Navigator uses to start your app when it is not already running. The default is `npm run dev`.

## Packaging

To create a VSIX package:

1. Install the packaging tool if needed: `npm install -g @vscode/vsce`
2. Run `vsce package` from the extension root.
3. Install the generated `.vsix` file in VS Code using Extensions > `...` > Install from VSIX...

## Notes

The route parser is heuristic-based. It works well for common React Router patterns, but it may need tuning if your app uses dynamic route generation, custom wrappers, or complex query-driven routing.
