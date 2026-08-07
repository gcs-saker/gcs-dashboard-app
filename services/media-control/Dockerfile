FROM golang:1.26.5-alpine@sha256:0178a641fbb4858c5f1b48e34bdaabe0350a330a1b1149aabd498d0699ff5fb2 AS build
WORKDIR /workspace
COPY go.mod go.sum ./
COPY cmd ./cmd
COPY internal ./internal
RUN go test ./...
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/media-control ./cmd/media-control

FROM alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
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
