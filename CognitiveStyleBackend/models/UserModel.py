from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    age: int
    password: str

class UserResponse(BaseModel):
    name: str
    email: EmailStr
    age: int

class UserLogin(BaseModel):
    email: EmailStr
    password: str
