#!/usr/bin/env python3
"""Export Koinonia's SonarCloud state (measures, gate, open issues) without changing anything.

Writes into the directory given as first argument (default: sonar-report/):
  summary.md    measures, Quality Gate, open issues by type/severity/rule/file
  measures.json raw measures and Quality Gate status
  issues.json   every open issue (rule, severity, file, line, message, effort)
  issues.csv    the same, one line per issue
"""
import base64
import csv
import getpass
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter

ORGANIZATION = "iccbretagne"
PROJECT = "iccbretagne_koinonia"
BASE = "https://sonarcloud.io/api/"
METRICS = [
    "ncloc", "bugs", "vulnerabilities", "code_smells", "security_hotspots",
    "reliability_rating", "security_rating", "sqale_rating", "sqale_index",
    "coverage", "duplicated_lines_density", "cognitive_complexity", "accepted_issues",
    "new_violations", "new_coverage", "new_duplicated_lines_density",
]
RATINGS = {"1.0": "A", "2.0": "B", "3.0": "C", "4.0": "D", "5.0": "E"}
PAGE_SIZE = 500
MAX_RESULTS = 10_000  # plafond de pagination de l'API issues/search

out_dir = sys.argv[1] if len(sys.argv) > 1 else "sonar-report"
branch = os.environ.get("SONAR_BRANCH") or "main"
token = os.environ.get("SONAR_TOKEN") or getpass.getpass("SonarCloud token: ")
authorization = "Basic " + base64.b64encode((token + ":").encode()).decode()


def api(path, params=None):
    request = urllib.request.Request(
        BASE + path + "?" + urllib.parse.urlencode(params or {}),
        headers={"Authorization": authorization},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise RuntimeError(
            f"SonarCloud {path}: HTTP {error.code}: {error.read().decode()}"
        ) from None


def relative(component):
    return component.split(":", 1)[1] if ":" in component else component


known = {m["key"] for m in api("metrics/search", {"ps": 500})["metrics"]}
measures = api("measures/component", {
    "component": PROJECT,
    "branch": branch,
    "metricKeys": ",".join(m for m in METRICS if m in known),
})["component"]["measures"]
values = {}
for m in measures:
    value = m.get("value") or (m.get("period") or {}).get("value")
    values[m["metric"]] = RATINGS.get(value, value) if m["metric"].endswith("_rating") else value
gate = api("qualitygates/project_status", {"projectKey": PROJECT, "branch": branch})["projectStatus"]

issues, rules = [], {}
page = 1
while True:
    result = api("issues/search", {
        "componentKeys": PROJECT,
        "organization": ORGANIZATION,
        "branch": branch,
        "resolved": "false",
        "additionalFields": "rules",
        "ps": PAGE_SIZE,
        "p": page,
    })
    rules.update({r["key"]: r["name"] for r in result.get("rules", [])})
    issues += result["issues"]
    total = result.get("paging", {}).get("total", result.get("total", 0))
    if len(issues) >= min(total, MAX_RESULTS) or not result["issues"]:
        break
    page += 1

rows = [{
    "key": i["key"],
    "rule": i["rule"],
    "rule_name": rules.get(i["rule"], ""),
    "type": i.get("type", ""),
    "severity": i.get("severity", ""),
    "status": i.get("issueStatus") or i.get("status", ""),
    "file": relative(i["component"]),
    "line": i.get("line", ""),
    "message": i.get("message", ""),
    "effort": i.get("effort", ""),
    "creation_date": i.get("creationDate", ""),
} for i in issues]

os.makedirs(out_dir, exist_ok=True)
with open(os.path.join(out_dir, "measures.json"), "w") as f:
    json.dump({"branch": branch, "measures": values, "quality_gate": gate}, f, indent=2)
with open(os.path.join(out_dir, "issues.json"), "w") as f:
    json.dump(rows, f, indent=2, ensure_ascii=False)
with open(os.path.join(out_dir, "issues.csv"), "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=list(rows[0]) if rows else ["key"])
    writer.writeheader()
    writer.writerows(rows)


def table(title, counter, label, limit=None, names=None):
    lines = [f"### {title}", "", f"| {label} | Issues |", "| --- | ---: |"]
    for key, count in counter.most_common(limit):
        lines.append(f"| `{key}` {names.get(key, '') if names else ''} | {count} |")
    return lines + [""]


summary = [f"## SonarCloud — `{PROJECT}` (branche `{branch}`)", "",
           f"Quality Gate : **{gate['status']}**", "", "| Mesure | Valeur |", "| --- | --- |"]
summary += [f"| {k} | {values[k]} |" for k in METRICS if k in values]
summary += ["", f"**{len(rows)} issues ouvertes**"
            + (f" (tronqué à {MAX_RESULTS})" if total > MAX_RESULTS else ""), ""]
summary += table("Par type", Counter(r["type"] for r in rows), "Type")
summary += table("Par sévérité", Counter(r["severity"] for r in rows), "Sévérité")
summary += table("Par règle", Counter(r["rule"] for r in rows), "Règle", names=rules)
summary += table("Fichiers les plus concernés (30)", Counter(r["file"] for r in rows), "Fichier", 30)
text = "\n".join(summary)
with open(os.path.join(out_dir, "summary.md"), "w") as f:
    f.write(text + "\n")
if step_summary := os.environ.get("GITHUB_STEP_SUMMARY"):
    with open(step_summary, "a") as f:
        f.write(text + "\n")
print(text)
