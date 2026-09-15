import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const user = "S-1-5-21-1111111111-2222222222-3333333333-1001";
const group = "S-1-5-21-1111111111-2222222222-3333333333-513";
const expected = `O:${user}G:${group}D:(A;ID;0x1f019f;;;BA)(A;ID;0x1f019f;;;SY)(A;ID;FA;;;${user})(A;;FR;;;${user})`;
const actual = `O:${user}G:${group}D:AI(A;;FR;;;${user})(A;ID;0x1f019f;;;BA)(A;ID;0x1f019f;;;SY)(A;ID;FA;;;${user})`;

test("tray restore compares Task Scheduler SDDL semantically", () => {
  const script = readFileSync(path.join(root, "codex-router.ps1"), "utf8");
  assert.match(script, /function Get-ControlCenterAceFingerprint/);
  assert.match(script, /-band 4096/);
  const restore = script.slice(script.indexOf("function Restore-ControlCenterTaskSnapshot"), script.indexOf("function Recover-ControlCenterUpdateTransaction"));
  assert.match(restore, /Test-SameControlCenterTaskSddl/);
  assert.doesNotMatch(restore, /GetSddlForm/);
  assert.doesNotMatch(script.slice(script.indexOf("function Test-SameControlCenterTaskSddl"), script.indexOf("function Read-ControlCenterTaskIdentityFromXml")), /GetSddlForm/);
});

test("canonical ACE order and D:AI are equivalent; security changes are refused", () => {
  if (process.platform !== "win32") return;
  const script = readFileSync(path.join(root, "codex-router.ps1"), "utf8");
  const start = script.indexOf("function Get-ControlCenterAceFingerprint");
  const end = script.indexOf("function Read-ControlCenterTaskIdentityFromXml");
  const body = [
    '$ErrorActionPreference = "Stop"', script.slice(start, end),
    `$expected = "${expected}"`, `$actual = "${actual}"`,
    'if (-not (Test-SameControlCenterTaskSddl $expected $actual)) { throw "canonical form should compare equal" }',
    `$missing = "O:${user}G:${group}D:(A;ID;0x1f019f;;;BA)(A;ID;0x1f019f;;;SY)(A;ID;FA;;;${user})"`,
    'if (Test-SameControlCenterTaskSddl $expected $missing) { throw "missing ACE accepted" }',
    `$owner = "O:S-1-5-32-544G:${group}D:(A;ID;0x1f019f;;;BA)(A;ID;0x1f019f;;;SY)(A;ID;FA;;;${user})(A;;FR;;;${user})"`,
    'if (Test-SameControlCenterTaskSddl $expected $owner) { throw "owner change accepted" }',
    `$groupChange = "O:${user}G:S-1-5-32-544D:(A;ID;0x1f019f;;;BA)(A;ID;0x1f019f;;;SY)(A;ID;FA;;;${user})(A;;FR;;;${user})"`,
    'if (Test-SameControlCenterTaskSddl $expected $groupChange) { throw "group change accepted" }',
    `$sid = "O:${user}G:${group}D:(A;ID;0x1f019f;;;WD)(A;ID;0x1f019f;;;SY)(A;ID;FA;;;${user})(A;;FR;;;${user})"`,
    'if (Test-SameControlCenterTaskSddl $expected $sid) { throw "SID change accepted" }',
    `$mask = "O:${user}G:${group}D:(A;ID;0x1f019f;;;BA)(A;ID;0x1f019f;;;SY)(A;ID;FR;;;${user})(A;;FR;;;${user})"`,
    'if (Test-SameControlCenterTaskSddl $expected $mask) { throw "mask change accepted" }',
    `$protected = "O:${user}G:${group}D:P(A;ID;0x1f019f;;;BA)(A;ID;0x1f019f;;;SY)(A;ID;FA;;;${user})(A;;FR;;;${user})"`,
    'if (Test-SameControlCenterTaskSddl $expected $protected) { throw "protected flag change accepted" }',
    'Write-Output "sddl-semantics-ok"',
  ].join("\r\n");
  const encoded = Buffer.from(body, "utf16le").toString("base64");
  const result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sddl-semantics-ok/);
});
