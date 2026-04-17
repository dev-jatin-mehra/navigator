# Navigator

Navigator scans a React workspace for route definitions and exposes them in a custom VS Code terminal. Each discovered route is printed with a local URL, so you can click the URL in the terminal or open a route by typing its number.

## Features

- Scans React Router route objects and `<Route />` JSX definitions.
- Opens a terminal-style route exposer from the command palette.
- Uses `localhost:5173` by default, with a manual port option inside the terminal.
- Prints URL-only route entries for quick opening.
- Checks whether the React app is running before loading routes.
- Handles startup questions completely inside the Navigator terminal.

## Usage

1. Open your React app workspace in VS Code.
2. Run `Navigator: Open Route Exposer` from the command palette.
3. If your app is not running, Navigator asks in terminal if it should run from here.
4. If you answer yes, enter an optional subfolder name (for example `client`) or press Enter for workspace root.
5. In the terminal, type `d` for the default port or `m` to enter a custom port.
6. Type a route number to open it in the browser, or Ctrl+click the printed URL.

## Settings

This extension contributes the following settings:

- `navigator.defaultPort`: Default port used when the terminal opens. The default is `5173`.
- `navigator.routeFileGlobs`: Glob patterns used to scan for route definitions. The default is `**/*.{ts,tsx,js,jsx}`.
- `navigator.startCommand`: Command Navigator uses to start your app when it is not already running. The default is `npm run dev`.

## Notes

The current parser is heuristic-based. It works well for common React Router patterns, but it may need tuning if your app uses heavily dynamic route generation or a custom abstraction layer.
