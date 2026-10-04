#!/usr/bin/env python3
"""Apply Koinonia's progressive Quality Gate to SonarCloud."""
import base64
import getpass
import json
import os
import urllib.error
import urllib.parse
import urllib.request

ORGANIZATION = "iccbretagne"
PROJECT = "iccbretagne_koinonia"
NAME = "Koinonia progressif"
BASE = "https://sonarcloud.io/api/"
token = os.environ.get("SONAR_TOKEN") or getpass.getpass("SonarCloud token: ")
authorization = "Basic " + base64.b64encode((token + ":").encode()).decode()


def api(path, params=None, post=False):
    encoded = urllib.parse.urlencode(params or {})
    request = urllib.request.Request(
        BASE + path + (("?" + encoded) if encoded and not post else ""),
        data=encoded.encode() if post else None,
        headers={"Authorization": authorization},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as error:
        raise RuntimeError(
            f"SonarCloud {path}: HTTP {error.code}: {error.read().decode()}"
        ) from None


desired = {
    "new_software_quality_security_rating": ("GT", "1"),
    "new_software_quality_reliability_rating": ("GT", "1"),
    "new_software_quality_maintainability_rating": ("GT", "1"),
    "new_security_hotspots_reviewed": ("LT", "100"),
    "new_coverage": ("LT", "50"),
    "new_duplicated_lines_density": ("GT", "3"),
}
metrics = {m["key"] for m in api("metrics/search", {"ps": 500})["metrics"]}
if missing := desired.keys() - metrics:
    raise RuntimeError(f"Missing SonarCloud metrics: {sorted(missing)}")
scope = {"organization": ORGANIZATION}
gates = api("qualitygates/list", scope)["qualitygates"]
gate = next((g for g in gates if g["name"] == NAME), None)
if gate is None:
    gate = api("qualitygates/create", dict(scope, name=NAME), True)
gate_id = gate["id"]
detail = api("qualitygates/show", dict(scope, id=gate_id))
current = {c["metric"]: c for c in detail["conditions"]}
for metric, (op, threshold) in desired.items():
    params = dict(scope, metric=metric, op=op, error=threshold)
    if metric in current:
        if (current[metric]["op"], current[metric]["error"]) != (op, threshold):
            api("qualitygates/update_condition", dict(params, id=current[metric]["id"]), True)
    else:
        api("qualitygates/create_condition", dict(params, gateId=gate_id), True)
for metric, condition in current.items():
    if metric not in desired:
        api("qualitygates/delete_condition", dict(scope, id=condition["id"]), True)
detail = api("qualitygates/show", dict(scope, id=gate_id))
assert {c["metric"]: (c["op"], c["error"]) for c in detail["conditions"]} == desired
api("qualitygates/select", dict(scope, gateId=gate_id, projectKey=PROJECT), True)
selected = api("qualitygates/get_by_project", dict(scope, project=PROJECT))
assert selected["qualityGate"]["name"] == NAME
print(json.dumps({"project": PROJECT, "gate": detail, "selection": selected}, indent=2))
