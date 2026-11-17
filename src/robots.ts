interface Rule {
  allow: boolean;
  pattern: string;
}

export interface RobotsGroup {
  agents: string[];
  rules: Rule[];
}

export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | undefined;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    // An empty "Disallow:" allows everything, so it adds no rule.
    if (current && (key === "allow" || key === "disallow") && value !== "") {
      current.rules.push({ allow: key === "allow", pattern: value });
    }
  }
  return groups;
}

/** Rules for a crawler token per RFC 9309: every group naming it, else the `*` group. */
function rulesFor(groups: RobotsGroup[], token: string): Rule[] {
  const t = token.toLowerCase();
  const named = groups.filter((g) => g.agents.includes(t));
  const chosen = named.length ? named : groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.rules);
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${re}${anchored ? "$" : ""}`).test(path);
}

/** Longest matching rule wins; on a tie, Allow wins. No matching rule means allowed. */
export function isAllowed(groups: RobotsGroup[], token: string, path = "/"): boolean {
  let best: Rule | undefined;
  for (const rule of rulesFor(groups, token)) {
    if (!matches(rule.pattern, path)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}
