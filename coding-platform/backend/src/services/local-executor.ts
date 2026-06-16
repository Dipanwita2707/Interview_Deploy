import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Verdict } from '../types';

// Language → { extension, command }
const LANG_CONFIG: Record<string, {
  ext: string;
  buildCmd?: (file: string, out: string) => string[];
  runCmd: (file: string, out: string) => string[];
}> = {
  python:     { ext: 'py',  runCmd: (f) => ['python3', f] },
  javascript: { ext: 'js',  runCmd: (f) => ['node', f] },
  typescript: { ext: 'ts',  runCmd: (f) => ['npx', '--yes', 'ts-node', '--transpile-only', f] },
  cpp:        {
    ext: 'cpp',
    buildCmd: (f, o) => ['g++', '-O2', '-std=c++17', '-o', o, f],
    runCmd:   (_, o) => [o],
  },
  c:          {
    ext: 'c',
    buildCmd: (f, o) => ['gcc', '-O2', '-o', o, f],
    runCmd:   (_, o) => [o],
  },
  java: {
    ext: 'java',
    buildCmd: (f) => ['javac', f],
    runCmd:   (f)  => ['java', '-cp', path.dirname(f), 'Main'],
  },
  // ─── Additional languages ─────────────────────────────────────
  go: {
    ext: 'go',
    runCmd: (f) => ['go', 'run', f],
  },
  rust: {
    ext: 'rs',
    buildCmd: (f, o) => ['rustc', '-o', o, f],
    runCmd:   (_, o) => [o],
  },
  ruby: {
    ext: 'rb',
    runCmd: (f) => ['ruby', f],
  },
  csharp: {
    // Uses dotnet-script (install: dotnet tool install -g dotnet-script)
    // Falls back to mono for .cs files if available
    ext: 'csx',
    runCmd: (f) => ['dotnet-script', f],
  },
};

export interface LocalExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timeMs: number;
  verdict: Verdict;
  error?: string;
}

// Run a command with timeout, returning stdout/stderr
function execWithTimeout(
  cmd: string[],
  stdin: string,
  timeLimitMs: number,
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number; timeMs: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const [bin, ...args] = cmd;

    const proc = spawn(bin, args, {
      cwd,
      env: { ...process.env, PATH: process.env.PATH },
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, timeLimitMs);

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    if (stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    }

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        exitCode: killed ? 124 : (code ?? 1),
        timeMs: Date.now() - start,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout: '', stderr: err.message, exitCode: 127, timeMs: Date.now() - start });
    });
  });
}

export async function runLocally(params: {
  sourceCode: string;
  language: string;
  stdin: string;
  expectedOutput: string;
  timeLimitMs?: number;
  memoryLimitKb?: number;
}): Promise<LocalExecResult> {
  const { sourceCode, language, stdin, expectedOutput, timeLimitMs = 5000 } = params;

  const langConf = LANG_CONFIG[language.toLowerCase()];
  if (!langConf) {
    return {
      stdout: '', stderr: `Unsupported language: ${language}`,
      exitCode: 1, timeMs: 0,
      verdict: Verdict.INTERNAL_ERROR,
      error: `Unsupported language: ${language}`,
    };
  }

  // Create a temp directory for this execution
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-exec-'));
  const srcFile = path.join(tmpDir, `solution.${langConf.ext}`);
  const binFile = path.join(tmpDir, 'solution');

  try {
    fs.writeFileSync(srcFile, sourceCode, 'utf8');

    // ── Compile step (C, C++, Java) ────────────────────────────
    if (langConf.buildCmd) {
      const buildCmd = langConf.buildCmd(srcFile, binFile);
      const buildResult = await execWithTimeout(buildCmd, '', 15000, tmpDir);

      if (buildResult.exitCode !== 0) {
        return {
          stdout: '', stderr: buildResult.stderr,
          exitCode: buildResult.exitCode, timeMs: buildResult.timeMs,
          verdict: Verdict.COMPILE_ERROR,
        };
      }
    }

    // ── Run step ──────────────────────────────────────────────
    const runCmd = langConf.runCmd(srcFile, binFile);
    const runResult = await execWithTimeout(runCmd, stdin, timeLimitMs, tmpDir);

    // ── Verdict determination ─────────────────────────────────
    let verdict: Verdict;

    if (runResult.exitCode === 124) {
      verdict = Verdict.TIME_LIMIT_EXCEEDED;
    } else if (runResult.exitCode !== 0) {
      verdict = Verdict.RUNTIME_ERROR;
    } else {
      const actual = runResult.stdout.trim().replace(/\r\n/g, '\n');
      const expected = expectedOutput.trim().replace(/\r\n/g, '\n');
      verdict = actual === expected ? Verdict.ACCEPTED : Verdict.WRONG_ANSWER;
    }

    return {
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      exitCode: runResult.exitCode,
      timeMs: runResult.timeMs,
      verdict,
    };
  } finally {
    // Cleanup temp files
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

export function isLanguageSupported(language: string): boolean {
  return language.toLowerCase() in LANG_CONFIG;
}
