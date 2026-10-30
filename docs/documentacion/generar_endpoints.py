"""Lee los routers de backend/app con ast y deja datos_endpoints.json (método, ruta, resumen por archivo)."""
import ast
import json
import re
from pathlib import Path

AQUI = Path(__file__).parent
APP = AQUI.parent.parent / "backend" / "app"


def bonito(nombre: str) -> str:
    t = nombre.strip("_").replace("_", " ")
    return t[:1].upper() + t[1:]


def main():
    res = {}
    for f in sorted(APP.glob("*.py")):
        try:
            arbol = ast.parse(f.read_text(encoding="utf8"))
        except SyntaxError:
            continue
        prefijos = {}
        for n in ast.walk(arbol):
            if isinstance(n, ast.Assign) and isinstance(n.value, ast.Call) and getattr(n.value.func, "id", "") == "APIRouter":
                pre = ""
                for k in n.value.keywords:
                    if k.arg == "prefix" and isinstance(k.value, ast.Constant):
                        pre = k.value.value
                for tg in n.targets:
                    prefijos[tg.id] = pre
        eps = []
        for n in ast.walk(arbol):
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
                for d in n.decorator_list:
                    if (isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute)
                            and d.func.attr in ("get", "post", "put", "patch", "delete")
                            and isinstance(d.func.value, ast.Name) and d.func.value.id in prefijos):
                        ruta = d.args[0].value if d.args and isinstance(d.args[0], ast.Constant) else ""
                        doc = (ast.get_docstring(n) or "").strip().split("\n")[0]
                        doc = re.sub(r"\s+", " ", doc)
                        eps.append({"m": d.func.attr.upper(), "r": prefijos[d.func.value.id] + ruta,
                                    "d": doc if doc else bonito(n.name), "doc": bool(doc)})
        if eps:
            eps.sort(key=lambda e: (e["r"], e["m"]))
            res[f.name] = eps
    (AQUI / "datos_endpoints.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf8")
    print(len(res), "archivos", sum(len(v) for v in res.values()), "endpoints")


if __name__ == "__main__":
    main()
