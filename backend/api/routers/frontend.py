from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(include_in_schema=False)
frontend_dist_dir = Path(__file__).resolve().parents[3] / "frontend" / "dist"


@router.get("/", include_in_schema=False)
def serve_frontend_root():
    if frontend_dist_dir.exists():
        return FileResponse(frontend_dist_dir / "index.html")
    raise HTTPException(status_code=404, detail="Frontend build not found")


@router.get("/{full_path:path}", include_in_schema=False)
def serve_frontend_app(full_path: str):
    if not frontend_dist_dir.exists():
        raise HTTPException(status_code=404, detail="Frontend build not found")

    requested_path = (frontend_dist_dir / full_path).resolve()
    try:
        requested_path.relative_to(frontend_dist_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=404, detail="Not Found")

    if requested_path.is_file():
        return FileResponse(requested_path)

    return FileResponse(frontend_dist_dir / "index.html")
