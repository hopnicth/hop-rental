/**
 * scripts/daily-check.mjs
 *
 * Safe scheduled task runner for hop-rental.
 *
 * Modes:
 *   node scripts/daily-check.mjs            — list today's tasks only (safe, no execution)
 *   node scripts/daily-check.mjs --run      — run tasks with per-task y/N confirmation
 *   node scripts/daily-check.mjs --run --yes — run tasks without confirmation
 *
 * Safety guarantees:
 *   - Default mode never executes anything.
 *   - Claude is called via spawnSync with a literal string prompt — no shell interpolation.
 *   - Shell commands are restricted to an explicit allowlist (COMMAND_ALLOWLIST).
 *   - Never commits, pushes, or modifies app/server/migration/payment code.
 *   - Run log written to docs/task-runs/YYYY-MM-DD.md (Bangkok time).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface as rlCreateInterface } from "node:readline/promises";

// ── Constants ────────────────────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, "..");
const SCHEDULE_FILE = resolve(ROOT, "scripts/schedule.json");
const RUN_LOG_DIR = resolve(ROOT, "docs/task-runs");
const BANGKOK_TZ = "Asia/Bangkok";

// Only these command IDs may be executed. Maps id → actual shell command array.
// Add new entries here deliberately — never derive commands from JSON directly.
const COMMAND_ALLOWLIST = {
  "typecheck": ["npx", ["tsc", "--noEmit"]],
  "gen-types": ["npx", ["supabase", "gen", "types", "typescript", "--local"]],
  "snapshot-schema": ["npx", ["supabase", "db", "dump", "--local", "--schema", "public"]],
};

// ── Date helpers (Bangkok time) ──────────────────────────────────────────────

function bangkokDate() {
  const now = new Date();
  // Get the date string in Bangkok timezone
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: new Intl.DateTimeFormat("en-US", {
      timeZone: BANGKOK_TZ,
      weekday: "long",
    })
      .formatToParts(now)
      .find((p) => p.type === "weekday")?.value,
    // 0=Sunday, 1=Monday … 6=Saturday
    weekdayNum: Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: BANGKOK_TZ,
        weekday: "short",
      }).format(now) === "Sun"
        ? 0
        : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
            new Intl.DateTimeFormat("en-US", {
              timeZone: BANGKOK_TZ,
              weekday: "short",
            }).format(now),
          ) + 1,
    ),
    dayOfMonth: Number(get("day")),
  };
}

// ── Schedule evaluation ──────────────────────────────────────────────────────

function todaysTasks(tasks, ctx) {
  return tasks.filter((task) => {
    switch (task.schedule) {
      case "daily":
        return true;
      case "weekly":
        return task.weekday === ctx.weekdayNum;
      case "monthly":
        return task.dayOfMonth === ctx.dayOfMonth;
      default:
        return false;
    }
  });
}

// ── User confirmation (for --run without --yes) ───────────────────────────────
// Strategy:
//   - TTY (interactive): readline/promises — prompt then wait for each answer.
//   - Pipe (CI / test): buffer all stdin lines upfront, pop one per question.
//     readline pauses the underlying stream after the first answer in pipe mode,
//     so we pre-read everything to avoid the second question hanging forever.

let _rl = null;
let _pipeBuffer = null; // null = not yet loaded, [] = loaded (may be empty)

async function loadPipedAnswers() {
  if (process.stdin.isTTY || _pipeBuffer !== null) return;
  _pipeBuffer = [];
  const loader = rlCreateInterface({ input: process.stdin });
  await new Promise((resolve) => {
    loader.on("line", (line) => _pipeBuffer.push(line));
    loader.on("close", resolve);
  });
}

function closeReadline() {
  if (_rl) {
    _rl.close();
    _rl = null;
  }
}

async function confirm(question) {
  // Piped / non-interactive path
  if (_pipeBuffer !== null) {
    const answer = _pipeBuffer.shift() ?? "";
    process.stdout.write(`${question}${answer}\n`);
    return answer.trim().toLowerCase() === "y";
  }
  // Interactive TTY path
  if (!_rl) {
    _rl = rlCreateInterface({ input: process.stdin, output: process.stdout });
  }
  const answer = await _rl.question(question);
  return answer.trim().toLowerCase() === "y";
}

// ── Run log ───────────────────────────────────────────────────────────────────

function appendRunLog(dateStr, lines) {
  if (!existsSync(RUN_LOG_DIR)) {
    mkdirSync(RUN_LOG_DIR, { recursive: true });
  }
  const logFile = resolve(RUN_LOG_DIR, `${dateStr}.md`);
  const existing = existsSync(logFile) ? readFileSync(logFile, "utf8") : "";
  const header = existing ? "" : `# Task Run Log — ${dateStr}\n\n`;
  writeFileSync(logFile, header + existing + lines.join("\n") + "\n", "utf8");
}

// ── Task runners ─────────────────────────────────────────────────────────────

function runClaudeTask(task) {
  console.log(`\n  ▶ Calling claude --print for: ${task.name}`);
  // spawnSync with literal array — no shell interpolation, no eval
  const result = spawnSync("claude", ["--print", task.prompt], {
    stdio: "inherit",
    cwd: ROOT,
  });
  if (result.error) {
    console.error(`  ✗ claude not found or failed: ${result.error.message}`);
    return { ok: false, error: result.error.message };
  }
  if (result.status !== 0) {
    console.error(`  ✗ claude exited with status ${result.status}`);
    return { ok: false, error: `exit ${result.status}` };
  }
  return { ok: true };
}

function runCommandTask(task) {
  const results = [];
  for (const cmdId of task.commands ?? []) {
    const entry = COMMAND_ALLOWLIST[cmdId];
    if (!entry) {
      console.error(`  ✗ Command "${cmdId}" is not in the allowlist — skipped.`);
      results.push({ cmdId, ok: false, error: "not in allowlist" });
      continue;
    }
    const [bin, args] = entry;
    console.log(`  ▶ Running allowlisted command: ${bin} ${args.join(" ")}`);
    const result = spawnSync(bin, args, { stdio: "inherit", cwd: ROOT });
    if (result.error) {
      console.error(`  ✗ ${cmdId} failed: ${result.error.message}`);
      results.push({ cmdId, ok: false, error: result.error.message });
    } else if (result.status !== 0) {
      console.error(`  ✗ ${cmdId} exited with status ${result.status}`);
      results.push({ cmdId, ok: false, error: `exit ${result.status}` });
    } else {
      console.log(`  ✓ ${cmdId} completed.`);
      results.push({ cmdId, ok: true });
    }
  }
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const runMode = args.includes("--run");
  const autoYes = args.includes("--yes");

  const ctx = bangkokDate();
  const { tasks } = JSON.parse(readFileSync(SCHEDULE_FILE, "utf8"));
  const due = todaysTasks(tasks, ctx);

  console.log("━━━ HOPNIC Daily Task Runner ━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Date    : ${ctx.date} (${ctx.weekday}) — Bangkok time`);
  console.log(`Mode    : ${runMode ? (autoYes ? "run --yes (no confirmation)" : "run (with confirmation)") : "list only"}`);
  console.log(`Due today: ${due.length} task(s)`);
  console.log("────────────────────────────────────────────────────────");

  if (due.length === 0) {
    console.log("\n  No tasks scheduled for today.\n");
    return;
  }

  for (const task of due) {
    const typeLabel = task.type === "claude" ? "[Claude]" : "[Commands]";
    console.log(`\n  ${typeLabel} ${task.id} — ${task.name}`);
    if (task.type === "claude") {
      console.log(`  Prompt  : ${task.prompt.slice(0, 80)}…`);
    } else if (task.type === "commands") {
      const safe = (task.commands ?? []).filter((c) => c in COMMAND_ALLOWLIST);
      const blocked = (task.commands ?? []).filter((c) => !(c in COMMAND_ALLOWLIST));
      if (safe.length) console.log(`  Commands: ${safe.join(", ")}`);
      if (blocked.length) console.log(`  Blocked : ${blocked.join(", ")} (not in allowlist)`);
    }
  }

  if (!runMode) {
    console.log("\n────────────────────────────────────────────────────────");
    console.log("ℹ  List mode — no tasks were executed.");
    console.log("   To run:  node scripts/daily-check.mjs --run");
    console.log("   Or use VS Code: Tasks > Run Task > Run Today Tasks");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    return;
  }

  // ── Execution phase ─────────────────────────────────────────────────────

  // Pre-buffer stdin lines if running in pipe mode (e.g. CI or tests).
  // Must be called before any confirm() so the stream is fully read first.
  await loadPipedAnswers();

  console.log("\n────────────────────────────────────────────────────────");
  console.log("Executing tasks...\n");

  const logLines = [`\n## Run at ${new Date().toLocaleString("th-TH", { timeZone: BANGKOK_TZ })}\n`];

  for (const task of due) {
    if (!autoYes) {
      const proceed = await confirm(
        `\n  Run "${task.name}"? [y/N] `,
      );
      if (!proceed) {
        console.log(`  — Skipped: ${task.name}`);
        logLines.push(`- ⏭  SKIPPED: ${task.id} — ${task.name}`);
        continue;
      }
    }

    logLines.push(`\n### ${task.id} — ${task.name}`);

    if (task.type === "claude") {
      const res = runClaudeTask(task);
      logLines.push(res.ok ? "- Status: ✅ completed" : `- Status: ❌ ${res.error}`);
    } else if (task.type === "commands") {
      const results = runCommandTask(task);
      for (const r of results) {
        logLines.push(
          r.ok ? `- ✅ ${r.cmdId}` : `- ❌ ${r.cmdId}: ${r.error}`,
        );
      }
    }
  }

  // Close readline before writing log (prevents stdin from staying open)
  closeReadline();

  // Write run log — never commits or pushes
  appendRunLog(ctx.date, logLines);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅  Done. Log written to docs/task-runs/${ctx.date}.md`);
  console.log("⚠   Nothing was committed or pushed.");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().catch((err) => {
  console.error("\nFatal:", err.message);
  process.exit(1);
});
