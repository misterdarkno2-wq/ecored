"""Arrancar FastAPI con Uvicorn: python -m scripts.run_server."""

import argparse

import uvicorn


def main():
    parser = argparse.ArgumentParser(description="Iniciar EcoRed con Uvicorn")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true", help="Recargar cambios durante desarrollo")
    args = parser.parse_args()
    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    main()
