FROM golang:1.26.5-alpine AS build
WORKDIR /workspace
COPY go.mod go.sum ./
COPY cmd ./cmd
COPY internal ./internal
RUN go test ./...
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/media-control ./cmd/media-control

FROM alpine:3.20
ARG SOURCE_COMMIT=unknown
LABEL org.opencontainers.image.revision=$SOURCE_COMMIT \
      org.opencontainers.image.base.name="alpine:3.20" \
      io.gcs-saker.go.version="1.26.5" \
      io.gcs-saker.grpc.version="1.82.1"
RUN adduser -D -H media
USER media
COPY --from=build /out/media-control /usr/local/bin/media-control
ENV GOGC=100
ENV GOMEMLIMIT=512MiB
EXPOSE 8081 9090
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:8081/healthz >/dev/null
ENTRYPOINT ["/usr/local/bin/media-control"]
