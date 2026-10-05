from database.connection import user_collection

async def create_user(user_data: dict):
    existing_user = await user_collection.find_one({"email": user_data["email"]})
    if existing_user:
        return {"error": "User already exists"}

    result = await user_collection.insert_one(user_data)
    new_user = await user_collection.find_one({"_id": result.inserted_id})

    if new_user:
        new_user["_id"] = str(new_user["_id"])
        new_user.pop("password", None)

    return new_user

async def get_users():
    users = []
    async for user in user_collection.find():
        user["_id"] = str(user["_id"])
        user.pop("password", None)
        users.append(user)
    return users

async def login_user(email: str, password: str):
    user = await user_collection.find_one({
        "email": email,
        "password": password
    })

    if not user:
        return None

    user["_id"] = str(user["_id"])
    user.pop("password", None)
    return user