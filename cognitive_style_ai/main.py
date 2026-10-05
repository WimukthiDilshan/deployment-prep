from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from config.database import init_db
from config.settings import settings
from routers.api import router
from services.mongo_sync_service import mongo_input_synchronizer


def create_app() -> FastAPI:
    app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)
    app.include_router(router, prefix=settings.API_PREFIX)

    @app.on_event("startup")
    def startup() -> None:
        init_db()
        mongo_input_synchronizer.start()

    @app.on_event("shutdown")
    def shutdown() -> None:
        mongo_input_synchronizer.stop()

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "message": str(exc.detail), "data": None, "errors": []},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"success": False, "message": "Validation failed.", "data": None, "errors": [e["msg"] for e in exc.errors()]},
        )
    return app


app = create_app()
