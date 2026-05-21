# model/user_model.py
from pydantic import BaseModel, EmailStr, ConfigDict

# 회원가입(POST /auth/signup) 요청
# username, email, password가 모두 존재하는지 확인
# email은 EmailStr 타입이므로 유효한 이메일 형식만 통과
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    inviteCode: str
    role: str | None = "viewer"

# 로그인(POST /auth/login) 요청에서 사용
# 로그인 시 username, password 값이 잘 들어왔는지 검증
# 여기서 받은 password는 DB의 hashed_password와 비교됨
class UserLogin(BaseModel):
    username: str
    password: str

# 응답(Response) 으로 클라이언트에 보낼 때 사용
# DB에 저장된 User 객체(SQLAlchemy ORM)를 → JSON 응답으로 직렬화
# 보안상 password는 제외하고, 필요한 필드만 내려줌
class UserResponse(BaseModel):
    id: int
    username: str
    email: EmailStr
    company_id: int
    role: str

    # v2: orm_mode 대체
    model_config = ConfigDict(from_attributes=True)
