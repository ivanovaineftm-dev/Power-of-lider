from pathlib import Path
from typing import Dict
from uuid import uuid4

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "storage" / "uploads"
PROCESSED_DIR = BASE_DIR / "storage" / "processed"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".xlsx", ".xls"}
SLOTS = {"sl", "staff_current", "staff_period"}

app = FastAPI(title="Excel Processor")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

# In-memory map: slot -> metadata
FILE_REGISTRY: Dict[str, Dict[str, str]] = {}


@app.get("/", response_class=HTMLResponse)
async def index() -> str:
    return (BASE_DIR / "static" / "index.html").read_text(encoding="utf-8")


def _validate_slot(slot: str) -> None:
    if slot not in SLOTS:
        raise HTTPException(status_code=400, detail=f"Unknown slot: {slot}")


def _validate_extension(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only .xlsx and .xls files are allowed")
    return ext


def _process_single_slot(slot: str, meta: Dict[str, str]) -> Dict[str, str]:
    input_path = Path(meta["upload_path"])
    if not input_path.exists():
        raise HTTPException(status_code=404, detail=f"Uploaded file not found for slot: {slot}")

    try:
        df = pd.read_excel(input_path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {exc}") from exc

    new_columns = [
        "Должность по состоянию на 05.02.2026",
        "Истина",
        "Подразделение по состоянию на 05.02.2026",
        "Истина",
    ]
    new_values = [["", True, "", True] for _ in range(len(df))]
    new_columns_df = pd.DataFrame(new_values, columns=new_columns)
    df = pd.concat([df, new_columns_df], axis=1)

    output_name = f"processed_{slot}_{uuid4().hex}.xlsx"
    output_path = PROCESSED_DIR / output_name

    try:
        df.to_excel(output_path, index=False, engine="openpyxl")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save processed file: {exc}") from exc

    # Remove old processed file if exists
    old = meta.get("processed_path")
    if old:
        old_path = Path(old)
        if old_path.exists():
            old_path.unlink()

    meta["processed_path"] = str(output_path)

    return {
        "slot": slot,
        "download_url": f"/api/download/{slot}",
    }


@app.post("/api/upload/{slot}")
async def upload_file(slot: str, file: UploadFile = File(...)) -> dict:
    _validate_slot(slot)
    ext = _validate_extension(file.filename or "")

    file_id = uuid4().hex
    saved_name = f"{slot}_{file_id}{ext}"
    upload_path = UPLOAD_DIR / saved_name

    with upload_path.open("wb") as f:
        while chunk := await file.read(1024 * 1024):
            f.write(chunk)

    FILE_REGISTRY[slot] = {
        "original_name": file.filename or saved_name,
        "upload_path": str(upload_path),
        "processed_path": "",
    }

    return {
        "message": "File uploaded",
        "slot": slot,
        "filename": file.filename,
    }


@app.delete("/api/upload/{slot}")
async def clear_slot(slot: str) -> dict:
    _validate_slot(slot)
    meta = FILE_REGISTRY.pop(slot, None)
    if meta:
        for key in ("upload_path", "processed_path"):
            path_str = meta.get(key)
            if path_str:
                path = Path(path_str)
                if path.exists():
                    path.unlink()
    return {"message": "Slot cleared", "slot": slot}


@app.post("/api/process")
async def process_uploaded_files() -> dict:
    if not FILE_REGISTRY:
        raise HTTPException(status_code=400, detail="Загрузите хотя бы один файл перед обработкой")

    processed_files = []
    for slot, meta in FILE_REGISTRY.items():
        processed = _process_single_slot(slot, meta)
        processed_files.append(
            {
                "slot": processed["slot"],
                "title": processed["slot"],
                "download_url": processed["download_url"],
            }
        )

    return {
        "message": "Files processed",
        "processed_count": len(processed_files),
        "processed_files": processed_files,
    }


@app.get("/api/download/{slot}")
async def download_file(slot: str):
    _validate_slot(slot)
    meta = FILE_REGISTRY.get(slot)
    if not meta or not meta.get("processed_path"):
        raise HTTPException(status_code=404, detail="No processed file found for this slot")

    processed_path = Path(meta["processed_path"])
    if not processed_path.exists():
        raise HTTPException(status_code=404, detail="Processed file does not exist")

    original_stem = Path(meta["original_name"]).stem
    download_name = f"{original_stem}_processed.xlsx"
    return FileResponse(
        processed_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=download_name,
    )
