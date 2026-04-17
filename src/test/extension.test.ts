import * as assert from "assert";
import * as vscode from "vscode";
import {
  buildRouteUrl,
  discoverRoutesInText,
  normalizeRoutePath,
} from "../routeDiscovery";

suite("Route discovery", () => {
  test("normalizes paths consistently", () => {
    assert.strictEqual(normalizeRoutePath(""), "/");
    assert.strictEqual(normalizeRoutePath("dashboard/"), "/dashboard");
    assert.strictEqual(normalizeRoutePath("/settings"), "/settings");
    assert.strictEqual(normalizeRoutePath("*"), "/*");
  });

  test("builds localhost URLs from a port and route", () => {
    assert.strictEqual(buildRouteUrl(5173, "/"), "http://localhost:5173");
    assert.strictEqual(
      buildRouteUrl(5173, "/dashboard/settings"),
      "http://localhost:5173/dashboard/settings",
    );
  });

  test("discovers JSX and route object definitions", () => {
    const source = `
      import { createBrowserRouter, Route } from "react-router-dom";

      const router = createBrowserRouter([
        {
          path: "/",
          element: <Home />,
        },
        {
          path: "dashboard",
          element: <DashboardLayout />,
          children: [
            {
              path: "settings",
              element: <Settings />,
            },
          ],
        },
      ]);

      export function AppRoutes() {
        return (
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/app" element={<Shell />}>
              <Route path="reports" element={<Reports />} />
            </Route>
          </Routes>
        );
      }
    `;

    const routes = discoverRoutesInText(
      source,
      vscode.Uri.file("C:/workspace/src/routes.tsx"),
    );
    const discoveredPaths = new Set(routes.map((route) => route.path));

    assert.ok(discoveredPaths.has("/"));
    assert.ok(discoveredPaths.has("/dashboard"));
    assert.ok(discoveredPaths.has("/dashboard/settings"));
    assert.ok(discoveredPaths.has("/login"));
    assert.ok(discoveredPaths.has("/app"));
    assert.ok(discoveredPaths.has("/app/reports"));
  });
});
