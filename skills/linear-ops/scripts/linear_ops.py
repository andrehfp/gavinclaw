#!/usr/bin/env python3
import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

import requests

API_URL = "https://api.linear.app/graphql"
DEFAULT_KEY_PATH = Path.home() / ".openclaw/.secrets/linear_api_key"
DEFAULT_TEAM_ID = "4bd7d6e4-5b0e-44fe-9070-7bc116657b6f"
DEFAULT_PROJECT_ID = "439c51cd-2512-47d0-aca5-adc4aca724af"


def load_api_key(path: Path) -> str:
    env = os.getenv("LINEAR_API_KEY", "").strip()
    if env:
        return env
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    raise SystemExit(f"API key not found. Set LINEAR_API_KEY or create {path}")


def gql(api_key: str, query: str, variables: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = {"query": query, "variables": variables or {}}
    r = requests.post(
        API_URL,
        headers={
            "Authorization": api_key,
            "Content-Type": "application/json",
        },
        data=json.dumps(payload),
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    if "errors" in data:
        raise SystemExit(f"Linear API error: {json.dumps(data['errors'], ensure_ascii=False)}")
    return data["data"]


def cmd_whoami(api_key: str) -> None:
    q = "query { viewer { id name email } }"
    data = gql(api_key, q)
    v = data["viewer"]
    print(f"OK | {v['name']} <{v['email']}> | {v['id']}")


def cmd_ids(api_key: str) -> None:
    q = """
    query {
      teams { nodes { id key name } }
      projects { nodes { id name state teams { nodes { id key name } } } }
    }
    """
    data = gql(api_key, q)
    print("Teams:")
    for t in data["teams"]["nodes"]:
        print(f"- {t['name']} ({t['key']}): {t['id']}")
    print("\nProjects:")
    for p in data["projects"]["nodes"]:
        teams = ", ".join([n["key"] for n in p["teams"]["nodes"]])
        print(f"- {p['name']} [{p['state']}] (teams: {teams}): {p['id']}")


def find_state_id(api_key: str, team_id: str, state_name: str) -> str:
    q = """
    query($teamId: String!) {
      team(id: $teamId) {
        states { nodes { id name type } }
      }
    }
    """
    data = gql(api_key, q, {"teamId": team_id})
    states = data["team"]["states"]["nodes"]
    for s in states:
        if s["name"].lower() == state_name.lower():
            return s["id"]
    names = ", ".join(s["name"] for s in states)
    raise SystemExit(f"State '{state_name}' not found. Available: {names}")


def find_label_id(api_key: str, team_id: str, label_name: str) -> str:
    q = """
    query($teamId: String!) {
      team(id: $teamId) {
        labels { nodes { id name } }
      }
    }
    """
    data = gql(api_key, q, {"teamId": team_id})
    labels = data["team"]["labels"]["nodes"]
    for lbl in labels:
        if lbl["name"].lower() == label_name.lower():
            return lbl["id"]

    # Create label if missing
    m = """
    mutation($input: IssueLabelCreateInput!) {
      issueLabelCreate(input: $input) {
        success
        issueLabel { id name }
      }
    }
    """
    out = gql(api_key, m, {"input": {"name": label_name, "teamId": team_id}})
    created = out["issueLabelCreate"]["issueLabel"]
    return created["id"]


def cmd_create(api_key: str, args: argparse.Namespace) -> None:
    label_ids = []
    if args.label:
        for label in args.label:
            label_ids.append(find_label_id(api_key, args.team_id, label))

    parts = []
    if args.objective:
        parts.append(f"Objetivo:\n{args.objective}")
    if args.kpi:
        parts.append(f"KPI esperado:\n{args.kpi}")
    if args.owner:
        parts.append(f"Owner:\n{args.owner}")
    if args.due:
        parts.append(f"Prazo:\n{args.due}")
    if args.checklist:
        ck = "\n".join([f"- [ ] {c}" for c in args.checklist])
        parts.append(f"Checklist:\n{ck}")

    description = "\n\n".join(parts) if parts else args.description

    input_obj = {
        "teamId": args.team_id,
        "projectId": args.project_id,
        "title": args.title,
        "description": description or "",
    }
    if args.due:
        datetime.strptime(args.due, "%Y-%m-%d")
        input_obj["dueDate"] = args.due
    if args.priority is not None:
        input_obj["priority"] = args.priority
    if label_ids:
        input_obj["labelIds"] = label_ids

    q = """
    mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier title url }
      }
    }
    """
    data = gql(api_key, q, {"input": input_obj})
    issue = data["issueCreate"]["issue"]
    print(f"Created {issue['identifier']}: {issue['title']}")
    print(issue["url"])


def cmd_list(api_key: str, args: argparse.Namespace) -> None:
    # project can be ID or name
    project_filter = {"id": {"eq": args.project}} if args.project and len(args.project) > 20 else None
    if args.project and not project_filter:
        project_filter = {"name": {"eq": args.project}}

    filter_obj: Dict[str, Any] = {"team": {"id": {"eq": args.team_id}}}
    if project_filter:
        filter_obj["project"] = project_filter
    if args.state:
        filter_obj["state"] = {"name": {"eq": args.state}}

    q = """
    query($filter: IssueFilter) {
      issues(filter: $filter, first: 50) {
        nodes {
          identifier
          title
          url
          dueDate
          state { name }
          project { name }
          labels { nodes { name } }
        }
      }
    }
    """
    data = gql(api_key, q, {"filter": filter_obj})
    items = data["issues"]["nodes"]
    if not items:
        print("No issues found.")
        return
    for it in items:
        labels = ",".join(l["name"] for l in it["labels"]["nodes"]) or "-"
        due = it["dueDate"] or "-"
        print(f"{it['identifier']} | {it['state']['name']} | due {due} | {it['project']['name']} | {labels}")
        print(f"  {it['title']}")
        print(f"  {it['url']}")


def cmd_move(api_key: str, args: argparse.Namespace) -> None:
    state_id = find_state_id(api_key, args.team_id, args.state)
    q1 = """
    query($id: String!) {
      issue(id: $id) { id identifier title }
    }
    """
    issue = gql(api_key, q1, {"id": args.issue})["issue"]

    m = """
    mutation($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue { identifier title state { name } url }
      }
    }
    """
    out = gql(api_key, m, {"id": issue["id"], "input": {"stateId": state_id}})
    up = out["issueUpdate"]["issue"]
    print(f"Moved {up['identifier']} -> {up['state']['name']}")
    print(up["url"])


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Linear ops helper")
    p.add_argument("--key-path", default=str(DEFAULT_KEY_PATH))
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("whoami")
    sub.add_parser("ids")

    c = sub.add_parser("create")
    c.add_argument("--team-id", default=DEFAULT_TEAM_ID)
    c.add_argument("--project-id", default=DEFAULT_PROJECT_ID)
    c.add_argument("--title", required=True)
    c.add_argument("--description")
    c.add_argument("--objective")
    c.add_argument("--kpi")
    c.add_argument("--owner")
    c.add_argument("--due", help="YYYY-MM-DD")
    c.add_argument("--priority", type=int, choices=[0, 1, 2, 3, 4])
    c.add_argument("--label", action="append")
    c.add_argument("--checklist", action="append", help="repeat for each checklist item")

    l = sub.add_parser("list")
    l.add_argument("--team-id", default=DEFAULT_TEAM_ID)
    l.add_argument("--project", default="Moldaspace", help="project name or ID")
    l.add_argument("--state", help="Backlog, In Progress, Done, etc")

    m = sub.add_parser("move")
    m.add_argument("--team-id", default=DEFAULT_TEAM_ID)
    m.add_argument("--issue", required=True, help="Issue ID or identifier (e.g. AND-12)")
    m.add_argument("--state", required=True)

    return p


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    api_key = load_api_key(Path(args.key_path))

    if args.cmd == "whoami":
        cmd_whoami(api_key)
    elif args.cmd == "ids":
        cmd_ids(api_key)
    elif args.cmd == "create":
        cmd_create(api_key, args)
    elif args.cmd == "list":
        cmd_list(api_key, args)
    elif args.cmd == "move":
        cmd_move(api_key, args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
