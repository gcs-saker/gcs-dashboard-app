# 1단계: Build
FROM node:18 AS builder
WORKDIR /app

COPY package*.json ./

# npm 업그레이드 + recharts + react-router-dom 추가 + 설치
RUN npm install -g npm@10.9.2 \
 && npm pkg set dependencies.recharts="^2.10.0" \
 && npm pkg set dependencies.react-router-dom="^6.22.3" \
 && npm install

# 앱 소스 투입 및 빌드
COPY . .
RUN npm run build

# 2단계: Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
