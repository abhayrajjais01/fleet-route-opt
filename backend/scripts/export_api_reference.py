"""
export_api_reference.py - Generates documentation/API_REFERENCE.md from the live OpenAPI schema (Week 16 · Track B)

Run from backend/:   python -m scripts.export_api_reference [../documentation/API_REFERENCE.md]

The reference is generated, not hand-written, so it always matches the code: every endpoint, grouped by tag, with
its summary, the roles allowed to call it, parameters and request body fields. Re-run it after changing the API.
"""

from __future__ import annotations

import inspect
import sys
from collections import defaultdict
from typing import Dict, List

from fastapi.routing import APIRoute

from app.main import app

INTRO = """# API Reference

Generated from the FastAPI OpenAPI schema by `python -m scripts.export_api_reference` (Week 16, Track B).
The interactive version is at **`/docs`** (Swagger UI) and **`/redoc`** on any running backend.

## Conventions

- **Base URL**: `/api/v1`. Behind the Docker stack's Nginx the same paths are served from the frontend origin
  (`http://localhost:8080/api/v1`).
- **Authentication**: `POST /api/v1/auth/login` with `{"email", "password"}` returns `access_token`; send it as
  `Authorization: Bearer <token>`. Tokens last 24 hours (`ACCESS_TOKEN_EXPIRE_MINUTES`).
- **Roles**: `ADMIN`, `FLEET_MANAGER`, `DISPATCHER`, `DRIVER`. The *Roles* line of each endpoint lists who may call it;
  "signed in" means any role, "public" means no token is needed. Other callers get `401` (no / bad token) or `403`.
- **Errors**: JSON `{"detail": "..."}`. Validation errors (`422`) carry a list of `{loc, msg}` objects.
- **Rate limits** (per client, per minute): login / register 10, AI agents (copilot, disruption, RAG search) 60,
  CSV / PDF exports 20, everything else 600. Over the limit: `429` with `Retry-After`. Every response carries
  `X-RateLimit-Limit` and `X-RateLimit-Remaining`.
- **Request size**: bodies over 10 MB get `413`.
- **Text input** is cleaned at the boundary (Unicode normalised, control / invisible characters and HTML tags
  removed); see `app/core/sanitize.py`.
"""


def _roles(route: APIRoute) -> str:
    """Reads the roles from require_roles(...) closures in the endpoint's dependencies."""
    found: List[str] = []
    signed_in = False

    def walk(dep) -> None:
        nonlocal signed_in
        call = dep.call
        name = getattr(call, "__name__", "")
        if name == "role_checker":
            cells = inspect.getclosurevars(call).nonlocals
            for role in cells.get("allowed_roles", []):
                if role.value not in found:
                    found.append(role.value)
        elif name == "get_current_user":
            signed_in = True
        for sub in dep.dependencies:
            walk(sub)

    for dep in route.dependant.dependencies:
        walk(dep)
    if found:
        return ", ".join(found)
    return "signed in" if signed_in else "public"


def _params(op: Dict) -> List[str]:
    out = []
    for p in op.get("parameters", []):
        schema = p.get("schema", {})
        typ = schema.get("type") or (schema.get("anyOf") or [{}])[0].get("type", "")
        req = "required" if p.get("required") else "optional"
        desc = (p.get("description") or "").replace("\n", " ")
        out.append(f"`{p['name']}` ({p['in']}, {typ or 'value'}, {req}){': ' + desc if desc else ''}")
    return out


def _body(op: Dict, schemas: Dict) -> str:
    content = (op.get("requestBody") or {}).get("content", {})
    for media, spec in content.items():
        ref = spec.get("schema", {}).get("$ref", "")
        name = ref.rsplit("/", 1)[-1] if ref else ""
        if name and name in schemas:
            props = schemas[name].get("properties", {})
            required = set(schemas[name].get("required", []))
            fields = ", ".join(f"`{k}`{'*' if k in required else ''}" for k in props)
            return f"{media} `{name}`: {fields}" if fields else f"{media} `{name}`"
        return media
    return ""


def _flatten(routes, prefix: str = "") -> Dict:
    """(full path, METHOD) -> APIRoute, through nested include_router() calls (FastAPI keeps them lazily)."""
    out: Dict = {}
    for r in routes:
        if isinstance(r, APIRoute):
            for m in r.methods:
                out[(prefix + r.path, m)] = r
        elif hasattr(r, "original_router") and hasattr(r, "include_context"):
            out.update(_flatten(r.original_router.routes, prefix + r.include_context.prefix))
    return out


def build() -> str:
    spec = app.openapi()
    schemas = spec.get("components", {}).get("schemas", {})
    routes = _flatten(app.routes)
    groups: Dict[str, List[str]] = defaultdict(list)
    for path, methods in spec["paths"].items():
        for method, op in methods.items():
            route = routes.get((path, method.upper()))
            tag = (op.get("tags") or ["Other"])[0]
            lines = [f"### `{method.upper()} {path}`", "", op.get("summary", "").strip() or "-", ""]
            lines.append(f"- **Roles**: {_roles(route) if route else 'public'}")
            params = _params(op)
            if params:
                lines.append("- **Parameters**: " + "; ".join(params))
            body = _body(op, schemas)
            if body:
                lines.append(f"- **Body**: {body} (`*` = required)")
            codes = ", ".join(sorted(op.get("responses", {})))
            lines.append(f"- **Responses**: {codes}")
            groups[tag].append("\n".join(lines))
    tag_desc = {t["name"]: t.get("description", "") for t in spec.get("tags", [])}
    out = [INTRO, "## Endpoints", ""]
    out += [f"- [{tag}](#{tag.lower().replace(' ', '-').replace('&', '').replace('(', '').replace(')', '').replace('/', '')})"
            for tag in groups]
    for tag, entries in groups.items():
        out += ["", f"## {tag}", ""]
        if tag_desc.get(tag):
            out += [tag_desc[tag], ""]
        out += ["\n\n".join(entries)]
    total = sum(len(v) for v in groups.values())
    out += ["", f"---\n{total} endpoints."]
    return "\n".join(out) + "\n"


def main() -> None:
    target = sys.argv[1] if len(sys.argv) > 1 else "../documentation/API_REFERENCE.md"
    with open(target, "w", encoding="utf-8", newline="\n") as f:
        f.write(build())
    print(f"wrote {target}")


if __name__ == "__main__":
    main()
