FROM golang:1.26.11-alpine@sha256:ecb67f987aa1a57794c91d19ade7ae0209f2f0f5496aaef9e6ae85ddf92d02ab AS build
WORKDIR /workspace
COPY go.mod go.sum ./
COPY cmd ./cmd
COPY internal ./internal
RUN go test ./...
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/media-control ./cmd/media-control

FROM scratch
ARG SOURCE_COMMIT=unknown
LABEL org.opencontainers.image.revision=$SOURCE_COMMIT \
      org.opencontainers.image.base.name="scratch" \
      io.gcs-saker.go.version="1.26.11" \
      io.gcs-saker.grpc.version="1.82.1"
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/media-control /usr/local/bin/media-control
USER 10001:10001
ENV GOGC=100
ENV GOMEMLIMIT=512MiB
EXPOSE 8081 9090
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/usr/local/bin/media-control", "healthcheck"]
ENTRYPOINT ["/usr/local/bin/media-control"]
