import * as assert from "node:assert";
import {
  clearDiagnostics,
  createSanitizedSupportReport,
  initializeLogger,
  logError,
  logInfo,
  logWarning,
  type DiagnosticSink,
} from "@/shared/logging/Logger";

suite("managed diagnostics", () => {
  teardown(() => clearDiagnostics());

  test("redacts nested secrets, credentials, user IDs, and full paths", () => {
    const captured: string[] = [];
    const registration = initializeLogger(createSink(captured));
    logError("Failed at C:\\Users\\alice\\secret.txt", {
      authorization: "Bearer sk-abcdefghijklmnopqrstuvwxyz",
      nested: { userId: "alice", url: "https://alice:password@example.test/path" },
    });
    registration.dispose();

    const output = captured.join("\n");
    for (const sensitive of ["alice", "password", "sk-abcdefghijklmnopqrstuvwxyz", "secret.txt"]) {
      assert.strictEqual(output.includes(sensitive), false, sensitive);
    }
    assert.match(output, /\[REDACTED\]/);
  });

  test("stays quiet below the configured level and bounds retained entries", () => {
    const captured: string[] = [];
    const registration = initializeLogger(createSink(captured), "warning");
    logInfo("not retained");
    for (let index = 0; index < 600; index += 1) {
      logWarning(`event-${index}`);
    }
    const report = createSanitizedSupportReport({ model: "deepseek-v4-flash" });
    registration.dispose();

    assert.strictEqual(captured.some((line) => line.includes("not retained")), false);
    assert.strictEqual(report.includes("event-0\n"), false);
    assert.strictEqual(report.includes("event-599"), true);
  });

  test("reinitialization disposes the prior sink exactly once", () => {
    let firstDisposals = 0;
    let secondDisposals = 0;
    const first = initializeLogger({ ...createSink([]), dispose: () => { firstDisposals += 1; } });
    const second = initializeLogger({ ...createSink([]), dispose: () => { secondDisposals += 1; } });
    first.dispose();
    second.dispose();
    assert.strictEqual(firstDisposals, 1);
    assert.strictEqual(secondDisposals, 1);
  });
});

function createSink(lines: string[]): DiagnosticSink {
  return {
    appendLine: (value) => lines.push(value),
    dispose: () => undefined,
  };
}
