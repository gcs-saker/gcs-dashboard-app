# GCS SAKER Dashboard

## Local Server-01 Dashboard Check

로컬에서 dashboard UI를 켜고 Server-01 backend/edge를 같이 확인할 때는 frontend가 직접
`http://localhost:8001`로 요청하면 안 된다. 로컬 Vite dev server는 `/api`, `/hls`,
`/webrtc`를 Server-01 public edge로 proxy한다.

로컬 `.env` 기준:

```bash
VITE_API_BASE_URL=/api
VITE_HLS_BASE_URL=/hls
VITE_LOCAL_WEBCAM_WHIP_URL=/webrtc/raw/local/webcam/whip
VITE_DEV_PROXY_TARGET=https://a4ai.tplinkdns.com
```

실행:

```bash
npm run dev
```

브라우저에서 `http://localhost:<vite-port>`로 열면 로그인 요청은 브라우저 기준
`/api/auth/login`으로 나가고, Vite가 `https://a4ai.tplinkdns.com/api/auth/login`으로
전달한다. DevTools에 `http://localhost:8001/auth/login`이 보이면 오래된 `.env` 또는
shell 환경변수 `VITE_API_BASE_URL`이 남아있는 상태다.

## M1 Sample Stream

M1 streaming development uses MediaMTX and the seed stream path `raw/sample/front`.

From the repository root, start MediaMTX:

```bash
cd gcs-dashboard
docker compose up mediamtx
```

Then publish the reproducible sample stream:

```bash
scripts/publish_sample_stream.sh
```

The script publishes to `rtsp://127.0.0.1:8554/raw/sample/front`, which maps to backend streamId `raw.sample.front`.
Full usage and troubleshooting notes are in `docs/m1/sample-stream-publish.md`.

For the full M1 streaming smoke procedure, run:

```bash
scripts/streaming_e2e_smoke.sh --check
```

Actual MediaMTX/backend/dashboard smoke testing is documented in `docs/m1/streaming-e2e-smoke-test.md`.

# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).
