/**
 * Guards the /docs/mcp-server page and the MCP section on /ai-agents (issue #254).
 *
 * These assertions exist because the page tells people to run a command against
 * a real published package. If the install command, the tool counts, or the
 * read-only-by-default claim drift away from
 * datanika-core/datanika-mcp/src/datanika_mcp/server.py, the docs become
 * instructions that fail — worse than no docs at all.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

// Mirrors server.py. 17 always-on + 8 gated behind --allow-write = 25.
const READ_TOOLS = [
  "get_agent_tiers",
  "get_connection_types",
  "list_connections",
  "get_connection",
  "introspect_connection",
  "preview_connection",
  "query_connection",
  "compile_transformation",
  "preview_transformation",
  "list_uploads",
  "list_pipelines",
  "list_transformations",
  "list_runs",
  "get_run",
  "get_run_logs",
  "list_catalog",
  "get_catalog_entry",
];

const WRITE_TOOLS = [
  "create_connection",
  "create_upload",
  "create_pipeline",
  "create_transformation",
  "bulk_import",
  "trigger_upload",
  "trigger_pipeline",
  "trigger_transformation",
];

describe("/docs/mcp-server", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("docs/mcp-server/index.html");
  });

  it("is built", () => {
    expect(html.length).toBeGreaterThan(1000);
  });

  it("documents the PyPI install command", () => {
    // The whole point of the local path: `uvx datanika-mcp` works today.
    // A git-subdirectory install string here would mean we regressed to the
    // pre-PyPI instructions.
    expect(html).toContain("uvx datanika-mcp");
    expect(html).not.toContain("#subdirectory=datanika-mcp");
  });

  it("shows the published package version, not a stale one", () => {
    // The page prints the expected `--version` output. Printing a version
    // nobody can reproduce is a small lie that erodes trust in the rest.
    expect(html).toContain("datanika-mcp 0.2.0");
    expect(html).not.toContain("datanika-mcp 0.1.0");
  });

  it("links to the PyPI project and the source", () => {
    expect(html).toContain("https://pypi.org/project/datanika-mcp/");
    expect(html).toContain(
      "https://github.com/datanika-io/datanika-core/tree/master/datanika-mcp"
    );
  });

  it("lists all 17 read-only tools", () => {
    for (const tool of READ_TOOLS) {
      expect(html, `missing read tool: ${tool}`).toContain(`<code>${tool}</code>`);
    }
  });

  it("lists all 8 write tools", () => {
    for (const tool of WRITE_TOOLS) {
      expect(html, `missing write tool: ${tool}`).toContain(`<code>${tool}</code>`);
    }
  });

  it("advertises the correct tool counts", () => {
    expect(READ_TOOLS.length + WRITE_TOOLS.length).toBe(25);
    expect(html).toContain("The 25 tools");
    expect(html).toContain("Read-only — always available (17)");
  });

  it("states the read-only default and the write opt-in flag", () => {
    expect(html).toContain("Read-only by default");
    expect(html).toContain("--allow-write");
  });

  it("documents both auth paths (flag and env var)", () => {
    expect(html).toContain("DATANIKA_API_KEY");
    expect(html).toContain("DATANIKA_URL");
    expect(html).toContain("--api-key");
  });

  it("covers Claude Desktop, Claude Code, and Cursor", () => {
    expect(html).toContain("claude_desktop_config.json");
    expect(html).toContain("claude mcp add datanika");
    expect(html).toContain(".cursor/mcp.json");
  });

  it("points self-hosted users at the API port, not the frontend port", () => {
    // The API serves /api/v1 on 8000; 3000 is the Reflex frontend. Sending
    // people to 3000 produces a confusing wall of 404s.
    expect(html).toContain("http://localhost:8000");
    expect(html).not.toContain("--url http://localhost:3000");
  });

  it("cross-links the agent docs and API key docs", () => {
    expect(html).toContain('href="/docs/ai-agents"');
    expect(html).toContain('href="/api/keys"');
  });

  describe("the hosted one-click path (core#394)", () => {
    it("gives the hosted endpoint URL", () => {
      // Verified end-to-end against production 2026-07-21. This URL is the
      // entire setup step for the hosted path — if it drifts, the docs are a
      // dead end rather than a guide.
      expect(html).toContain("https://app.datanika.io/mcp");
    });

    it("frames both paths so neither reads as the only option", () => {
      expect(html).toContain("Two ways to connect");
      expect(html).toContain('id="one-click"');
      expect(html).toContain('id="local"');
    });

    it("describes hosted writes as consent-time scope, not impossible", () => {
      // Was: "the hosted path never allows writes" — true until core#445, which
      // made write grantable at OAuth consent. That guard outlived the behaviour
      // it guarded and briefly enforced a false claim. Guarding another team's
      // *behaviour* is worth doing, but it must be updated with the behaviour;
      // only the durable facts below (tool names, install string) are safe to
      // pin indefinitely.
      expect(html).toMatch(/granted\s+at\s+<strong>authorization time<\/strong>|at\s+authorization\s+time/i);
      expect(html).not.toMatch(/hosted endpoint there is no opt-in/i);
    });

    it("keeps the two properties that make the grant safe", () => {
      // Both are load-bearing and easy to lose in an edit: a client that omits
      // `scope` must not be read as consenting to write, and a pasted bearer key
      // must not silently inherit write from its own scopes.
      expect(html).toMatch(/[Ss]ilence is (never read as|not) consent/i);
      expect(html).toMatch(/pasted API key/i);
    });

    it("describes what the approval screen actually shows", () => {
      // Replaced the core#450 gap-disclosure guard, which was marked DELETE WHEN
      // core#450 LANDS. It landed (core#463) and the screen now branches on the
      // granted scope, verified end-to-end against prod 2026-07-22. The caveat
      // and its guard both go; what stays is the durable claim that the docs
      // describe the screen the reader will actually see.
      expect(html).not.toMatch(/consent screen still says read-only/i);
      expect(html).not.toContain("datanika-io/datanika-core/issues/450");
      expect(html).toMatch(/Read and write/);
      expect(html).toMatch(/trigger runs/i);
    });

    it("tells the reader how to revoke a one-click grant", () => {
      // Consent mints an API key named "MCP: <app>"; that key is the off
      // switch. A consent flow documented without its undo is half a flow.
      expect(html).toContain("MCP: &lt;app name&gt;");
      expect(html).toMatch(/Settings → API Keys/);
    });

    it("does not promise a browser UI path we cannot verify", () => {
      // Client-side menu paths change without notice and we do not control
      // them. Naming the clients is fine; scripting their UI is not.
      expect(html).not.toMatch(/click\s+(Settings|Connectors)\s*(→|>)\s*Add/i);
    });
  });
});

describe("/ai-agents MCP section", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("ai-agents/index.html");
  });

  it("has an anchored MCP section", () => {
    expect(html).toContain('id="mcp"');
    expect(html).toContain('href="#mcp"');
  });

  it("names the package and the install runner", () => {
    expect(html).toContain("datanika-mcp");
    expect(html).toContain("uvx datanika-mcp");
  });

  it("states the read-only default", () => {
    expect(html).toContain("Read-only by default");
    expect(html).toContain("--allow-write");
  });

  it("links to the setup guide", () => {
    expect(html).toContain('href="/docs/mcp-server"');
  });

  describe("stdio-only claims stay scoped to the local path", () => {
    // Product flagged (2026-07-21) that this section described stdio behaviour
    // as if it were the whole product: "Runs on your machine", "your API key
    // stays local", "anything that speaks MCP over stdio". All true of the
    // local path, none true of the hosted endpoint, which was documented in
    // #265. A positioning page asserting the wrong security model is worse
    // than one that says nothing.

    it("surfaces the hosted endpoint alongside the local one", () => {
      expect(html).toContain("https://app.datanika.io/mcp");
      expect(html).toMatch(/hosted/i);
    });

    it("does not claim the server runs on your machine unconditionally", () => {
      expect(html).not.toContain("Runs on your machine");
      expect(html).not.toMatch(/API key stays local and talks straight/i);
    });

    it("does not present stdio as the only transport", () => {
      expect(html).not.toMatch(/Anything that\s+speaks MCP over stdio works the same way/i);
    });

    it("names both ways writes get enabled, without implying either is the only one", () => {
      // Was: "over /mcp there is no --allow-write and no scope that enables
      // writes" — invalidated by core#445. The page must now name the hosted
      // route (authorization time) as well as the local flag, or it understates
      // the product in the other direction.
      expect(html).toMatch(/authorization time/i);
      expect(html).toContain("--allow-write");
      expect(html).not.toMatch(/there is no opt-in/i);
    });
  });
});

describe("MCP discoverability across the site", () => {
  it("the docs index surfaces the MCP server", () => {
    const html = readHtml("docs/index.html");
    expect(html).toContain('href="/docs/mcp-server"');
  });

  it("the agent docs page routes readers to the MCP path", () => {
    const html = readHtml("docs/ai-agents/index.html");
    expect(html).toContain('href="/docs/mcp-server"');
  });

  it("no published page still calls the MCP server unreleased", () => {
    // Two blog posts said "we're working on a Claude Code MCP server" long
    // after it shipped to PyPI. Guard against that regressing.
    for (const slug of ["ai-agent-native", "claude-built-a-data-pipeline"]) {
      const html = readHtml(`blog/${slug}/index.html`);
      expect(html, `${slug} still promises a future MCP server`).not.toMatch(
        /working on (a|an)[^.]*MCP/i
      );
      expect(html, `${slug} should link the MCP guide`).toContain("/docs/mcp-server");
    }
  });
});
