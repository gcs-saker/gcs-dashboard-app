# GCS Dashboard 실행 안내

이 문서는 npm 기준으로 프론트엔드 화면을 로컬 PC에서 실행하는 방법을 설명합니다.

## 1. 준비물

먼저 PC에 Node.js가 설치되어 있어야 합니다.

- Node.js 설치: https://nodejs.org
- 설치할 때는 LTS 버전을 권장합니다.
- Node.js를 설치하면 npm도 함께 설치됩니다.

설치가 끝난 뒤 터미널에서 아래 명령이 동작하면 준비가 완료된 상태입니다.

```bash
node -v
npm -v
```

## 2. 소스코드 받기

Git을 사용할 수 있으면 아래처럼 받습니다.

```bash
git clone https://github.com/gcs-saker/gcs-dashboard-app.git
cd gcs-dashboard-app
```

Git 사용이 어렵다면 GitHub에서 ZIP 파일을 내려받아 압축을 푼 뒤, 압축을 푼 폴더로 이동합니다.

## 3. 프론트엔드 실행

저장소 루트에서 아래 명령을 순서대로 실행합니다.

```bash
cd gcs-dashboard
npm ci
npm start
```

정상 실행되면 브라우저에서 아래 주소로 접속합니다.

```text
http://localhost:3001
```

이 프로젝트는 `gcs-dashboard/.env`에 `PORT=3001`이 설정되어 있어 3001번 포트로 실행됩니다.

## 4. 종료 방법

실행 중인 터미널에서 아래 키를 누르면 종료됩니다.

```text
Ctrl + C
```

종료 여부를 물어보면 `Y`를 입력하고 Enter를 누릅니다.

## 5. 배포용 파일 만들기

개발 서버가 아니라 정적 배포 파일을 만들고 싶으면 아래 명령을 실행합니다.

```bash
cd gcs-dashboard
CI=false npm run build
```

성공하면 `gcs-dashboard/build` 폴더가 생성됩니다.

## 6. 참고 사항

- `npm ci`는 처음 한 번 실행하면 됩니다.
- 소스가 바뀌었거나 의존성이 바뀐 경우 다시 실행할 수 있습니다.
- 인터넷 연결이 없으면 `npm ci`에서 패키지 다운로드가 실패할 수 있습니다.
- 백엔드, 지도 타일, 영상 스트림 서버에 연결되지 않는 환경에서는 일부 데이터나 영상이 비어 보일 수 있습니다.
- 화면 실행만 확인하는 경우에는 `npm start`로 충분합니다.
