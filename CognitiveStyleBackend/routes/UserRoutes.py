from fastapi import APIRouter, HTTPException
from models.UserModel import UserCreate,UserLogin
from services.UserService import create_user, get_users, login_user

router = APIRouter(prefix="/users", tags=["Users"])

@router.post("/")
async def add_user(user: UserCreate):
    return await create_user(user.model_dump())

@router.get("/")
async def list_users():
    return await get_users()

@router.post("/login")
async def login(user: UserLogin):
    existing_user = await login_user(user.email, user.password)

    if not existing_user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {
        "message": "Login successful",
        "user": existing_user
    }