# 1단계: Build
FROM node:22 AS builder
WORKDIR /app
ARG VITE_API_BASE_URL=/api
ARG VITE_HLS_BASE_URL=/hls
ARG VITE_DEFAULT_STREAM_ID=CID001
ARG VITE_LOCAL_WEBCAM_WHIP_URL=https://localhost/webrtc/raw/local/webcam/whip
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_HLS_BASE_URL=$VITE_HLS_BASE_URL
ENV VITE_DEFAULT_STREAM_ID=$VITE_DEFAULT_STREAM_ID
ENV VITE_LOCAL_WEBCAM_WHIP_URL=$VITE_LOCAL_WEBCAM_WHIP_URL

COPY package*.json ./

RUN npm ci

# 앱 소스 투입 및 빌드
COPY . .
RUN npm run build

# 2단계: Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
