#!/usr/bin/env python3
"""Accept, in bulk, the SonarCloud issues reviewed as intentional (scripts/sonar-accepted.json).

Each group names one rule, the files where it is accepted, a justification posted as a comment,
and a ceiling: a group matching more issues than `max` aborts the whole run before any change,
so a rule spreading to new code is never accepted silently. Without --apply, only lists matches.
"""
import base64
import getpass
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict

ORGANIZATION = "iccbretagne"
PROJECT = "iccbretagne_koinonia"
BASE = "https://sonarcloud.io/api/"
CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sonar-accepted.json")
PAGE_SIZE = 500

apply = "--apply" in sys.argv[1:]
branch = os.environ.get("SONAR_BRANCH") or "main"
token = os.environ.get("SONAR_TOKEN") or getpass.getpass("SonarCloud token: ")
authorization = "Basic " + base64.b64encode((token + ":").encode()).decode()


def api(path, params, post=False):
    encoded = urllib.parse.urlencode(params, doseq=True)
    request = urllib.request.Request(
        BASE + path + ("" if post else "?" + encoded),
        data=encoded.encode() if post else None,
        headers={"Authorization": authorization},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as error:
        raise RuntimeError(
            f"SonarCloud {path}: HTTP {error.code}: {error.read().decode()}"
        ) from None


def open_issues(rule):
    issues, page = [], 1
    while True:
        result = api("issues/search", {
            "componentKeys": PROJECT,
            "organization": ORGANIZATION,
            "branch": branch,
            "rules": rule,
            "resolved": "false",
            "additionalFields": "transitions",
            "ps": PAGE_SIZE,
            "p": page,
        })
        issues += result["issues"]
        if len(issues) >= result["paging"]["total"] or not result["issues"]:
            return issues
        page += 1


with open(CONFIG) as f:
    groups = json.load(f)

by_rule = {rule: open_issues(rule) for rule in {g["rule"] for g in groups}}
plan, errors = [], []
for group in groups:
    files = set(group["files"])
    matched = [i for i in by_rule[group["rule"]]
               if i["component"].split(":", 1)[-1] in files]
    print(f"\n{group['rule']} — {len(matched)} issue(s) (max {group['max']}) : {group['reason']}")
    for i in matched:
        print(f"  {i['component'].split(':', 1)[-1]}:{i.get('line', '?')}  {i['message']}")
    if len(matched) > group["max"]:
        errors.append(f"{group['rule']} : {len(matched)} issues > max {group['max']}")
    plan.append((group, matched))

counts, planned = defaultdict(int), set()
for group, matched in plan:
    counts[group["rule"]] += len(matched)
    planned |= {i["key"] for i in matched}
for rule, issues in sorted(by_rule.items()):
    left = [i for i in issues if i["key"] not in planned]
    if left:
        print(f"\n{rule} — {len(left)} issue(s) laissée(s) ouverte(s) :")
        for i in left:
            print(f"  {i['component'].split(':', 1)[-1]}:{i.get('line', '?')}  {i['message']}")
print("\nTotal : " + ", ".join(f"{r} {n}" for r, n in sorted(counts.items()))
      + f" — {sum(counts.values())} issue(s)")
if errors:
    sys.exit("Arrêt, aucune modification : " + " ; ".join(errors))
if not apply:
    print("Simulation : relancer avec --apply pour accepter ces issues.")
    sys.exit(0)

accepted = 0
for group, matched in plan:
    # SonarCloud récent : « accept » ; à défaut, l'ancien « wontfix ».
    for transition in ("accept", "wontfix"):
        keys = [i["key"] for i in matched if transition in i.get("transitions", [])]
        for start in range(0, len(keys), PAGE_SIZE):
            chunk = keys[start:start + PAGE_SIZE]
            result = api("issues/bulk_change", {
                "issues": ",".join(chunk),
                "do_transition": transition,
                "comment": group["reason"],
                "sendNotifications": "false",
            }, post=True)
            accepted += result.get("success", 0)
            if result.get("failures"):
                print(f"  {result['failures']} échec(s) sur {group['rule']}")
        matched = [i for i in matched if i["key"] not in keys]
    if matched:
        print(f"  {len(matched)} issue(s) sans transition accept/wontfix sur {group['rule']}")
print(f"\n{accepted} issue(s) acceptée(s).")
