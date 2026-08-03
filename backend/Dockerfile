FROM python:3.12-slim
ARG SOURCE_COMMIT=unknown
LABEL org.opencontainers.image.revision=$SOURCE_COMMIT

# 타임존 설정
ENV TZ=Asia/Seoul

# 시스템 패키지 설치 (cryptography, SQLAlchemy 등 빌드 시 필요)
RUN apt-get update && apt-get install -y \
    gcc \
    libffi-dev \
    libssl-dev \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# 작업 디렉토리
WORKDIR /app

# 종속성 복사 및 설치
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir -r requirements.txt

# 소스코드 복사
COPY . .

# 포트 개방
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/healthz', timeout=2).read()"

# 서버 실행
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
