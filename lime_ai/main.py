from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from config.database import init_db
from config.settings import settings
from routers.api import router


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
    )
    app.include_router(router, prefix=settings.API_PREFIX)

    @app.on_event("startup")
    def _startup() -> None:
        init_db()

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
        if isinstance(exc.detail, dict):
            payload = exc.detail
        else:
            payload = {
                "success": False,
                "message": str(exc.detail),
                "data": None,
                "errors": [],
            }
        return JSONResponse(status_code=exc.status_code, content=payload)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "message": "Validation failed.",
                "data": None,
                "errors": [error["msg"] for error in exc.errors()],
            },
        )

    return app


app = create_app()
