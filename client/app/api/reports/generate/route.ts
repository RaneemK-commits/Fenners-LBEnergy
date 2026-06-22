import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ALLOWED = new Set(["financial", "sustainability"]);

// Resolve a real Python interpreter. On Windows "python3"/"python" can be the
// Microsoft Store stub, which just prints "Python wurde nicht gefunden" and
// exits non-zero — so we probe candidates and pick the first one that actually
// runs. `py` (the Windows launcher) is preferred there. Override with $PYTHON.
let cachedPython: string[] | null = null;
function resolvePython(): string[] | null {
  if (cachedPython) return cachedPython;

  const candidates: string[][] = [];
  if (process.env.PYTHON) candidates.push([process.env.PYTHON]);
  if (process.platform === "win32") {
    candidates.push(["py", "-3"], ["python"], ["python3"]);
  } else {
    candidates.push(["python3"], ["python"]);
  }

  for (const cmd of candidates) {
    try {
      const probe = spawnSync(cmd[0], [...cmd.slice(1), "--version"], {
        encoding: "utf8",
      });
      // ENOENT → probe.error; store stub → status 9009 / "not found" message.
      const out = `${probe.stdout ?? ""}${probe.stderr ?? ""}`;
      if (!probe.error && probe.status === 0 && /Python \d/.test(out)) {
        cachedPython = cmd;
        return cmd;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function POST(request: Request) {
  let body: { report?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const report = body.report;
  if (typeof report !== "string" || !ALLOWED.has(report)) {
    return Response.json(
      { error: `report must be one of: ${[...ALLOWED].join(", ")}` },
      { status: 400 },
    );
  }

  // next dev runs from <repo>/client, so repo root is one level up.
  const repoRoot = path.resolve(process.cwd(), "..");

  const python = resolvePython();
  if (!python) {
    return Response.json(
      {
        error:
          "No working Python interpreter found. Install Python 3 (or set the PYTHON env var to its path) and restart the dev server.",
      },
      { status: 500 },
    );
  }

  return new Promise<Response>((resolve) => {
    const child = spawn(
      python[0],
      [...python.slice(1), "scripts/generate_report.py", report],
      { cwd: repoRoot },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));

    child.on("error", (err) => {
      resolve(
        Response.json(
          { error: `Failed to launch ${python.join(" ")}: ${err.message}` },
          { status: 500 },
        ),
      );
    });

    child.on("close", async (code) => {
      if (code !== 0) {
        resolve(
          Response.json(
            { ok: false, exitCode: code, stdout, stderr },
            { status: 500 },
          ),
        );
        return;
      }

      // Script prints one `Wrote <abs-path>.pdf` line per PDF emitted.
      // Pick the last one matching the requested report type.
      const lines = [...stdout.matchAll(/^Wrote (.+\.pdf)\s*$/gm)].map((m) => m[1].trim());
      const pdfPath = [...lines].reverse().find((p) =>
        path.basename(p).startsWith(`${report}_`),
      );
      if (!pdfPath) {
        resolve(
          Response.json(
            { ok: false, error: "Script produced no PDF.", stdout, stderr },
            { status: 500 },
          ),
        );
        return;
      }

      try {
        const bytes = await readFile(pdfPath);
        const filename = path.basename(pdfPath);
        resolve(
          new Response(new Uint8Array(bytes), {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="${filename}"`,
              "Content-Length": String(bytes.length),
            },
          }),
        );
      } catch (e) {
        resolve(
          Response.json(
            {
              ok: false,
              error: `Could not read generated PDF: ${(e as Error).message}`,
              pdfPath,
            },
            { status: 500 },
          ),
        );
      }
    });
  });
}
