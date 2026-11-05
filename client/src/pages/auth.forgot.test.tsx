import { test } from "node:test";
import assert from "node:assert/strict";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The app's JSX is compiled for Vite's automatic runtime. The test loader emits
// classic React.createElement calls, which read React from the global scope.
(globalThis as typeof globalThis & { React: typeof React }).React = React;
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../hooks/useAuth";
import AuthPage from "./auth";
import PasswordResetPage from "./password-reset";

if (typeof globalThis.window === "undefined") {
  const windowStub = {
    location: { pathname: "/", search: "", href: "http://localhost/" },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    history: { replaceState() {} },
  };
  Object.assign(globalThis, { window: windowStub, document: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} } });
}

function loginHtml(mode: "login" | "signup") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client },
      createElement(AuthProvider, null, createElement(AuthPage, { initialMode: mode }))),
  );
}

test("the login page has a Forgot password link under the password field", () => {
  const html = loginHtml("login");
  const passwordAt = html.indexOf('data-testid="input-password"');
  const linkAt = html.indexOf('data-testid="link-forgot-password"');
  assert.ok(passwordAt !== -1, html);
  assert.ok(linkAt > passwordAt, html);
  assert.match(html, /Forgot password\?/);
  assert.match(html, /href="\/forgot-password"/);
});

test("the sign-up page does not offer password reset", () => {
  const html = loginHtml("signup");
  assert.equal(html.includes("Forgot password?"), false);
  assert.equal(html.includes("link-forgot-password"), false);
});

test("the forgot-password and set-password pages render in the login card", () => {
  window.location.pathname = "/forgot-password";
  window.location.search = "";
  const forgot = renderToStaticMarkup(createElement(PasswordResetPage));
  assert.match(forgot, /Forgot your password\?/);
  assert.match(forgot, /data-testid="input-reset-email"/);
  assert.match(forgot, /Email me a reset link/);

  window.location.pathname = "/reset-password";
  window.location.search = "?token=abc";
  const reset = renderToStaticMarkup(createElement(PasswordResetPage));
  assert.match(reset, /Choose a new password/);
  assert.match(reset, /data-testid="input-new-password"/);
  assert.match(reset, /data-testid="input-confirm-password"/);
  assert.match(reset, /At least 8 characters/);
});
