#!/usr/bin/env python3
"""Smoke-test TURN long-term credential allocation without external packages."""

from __future__ import annotations

import argparse
import binascii
from dataclasses import dataclass
import hashlib
import hmac
import os
import secrets
import socket
import struct
import sys
from typing import Sequence
from urllib.parse import parse_qs, urlparse


MAGIC_COOKIE = 0x2112A442
ALLOCATE_REQUEST = 0x0003
ALLOCATE_SUCCESS_RESPONSE = 0x0103
ALLOCATE_ERROR_RESPONSE = 0x0113
ATTR_USERNAME = 0x0006
ATTR_MESSAGE_INTEGRITY = 0x0008
ATTR_ERROR_CODE = 0x0009
ATTR_REALM = 0x0014
ATTR_NONCE = 0x0015
ATTR_REQUESTED_TRANSPORT = 0x0019
ATTR_XOR_RELAYED_ADDRESS = 0x0016
ATTR_FINGERPRINT = 0x8028
TRANSPORT_UDP = 17
DEFAULT_TURN_URL = "turn:a4ai.tplinkdns.com:3478?transport=udp"


@dataclass(frozen=True)
class TurnTarget:
    host: str
    port: int
    transport: str


@dataclass(frozen=True)
class StunAttribute:
    type: int
    value: bytes


@dataclass(frozen=True)
class StunMessage:
    type: int
    transaction_id: bytes
    attributes: tuple[StunAttribute, ...]


def parse_turn_url(value: str) -> TurnTarget:
    parsed = urlparse(value)
    if parsed.scheme != "turn":
        raise ValueError("TURN URL must start with turn:")
    if parsed.hostname:
        host = parsed.hostname
        port = parsed.port or 3478
        query = parsed.query
    else:
        raw_target, _, query = value.removeprefix("turn:").partition("?")
        host, separator, raw_port = raw_target.rpartition(":")
        if not separator:
            host = raw_target
            raw_port = ""
        port = int(raw_port) if raw_port else 3478
    if not host:
        raise ValueError("TURN URL must include a host")
    transport = parse_qs(query).get("transport", ["udp"])[0].lower()
    if transport not in {"udp", "tcp"}:
        raise ValueError("TURN smoke supports udp or tcp transport")
    return TurnTarget(host=host, port=port, transport=transport)


def padded(value: bytes) -> bytes:
    padding = (4 - (len(value) % 4)) % 4
    return value + (b"\x00" * padding)


def encode_attribute(attr_type: int, value: bytes) -> bytes:
    return struct.pack("!HH", attr_type, len(value)) + padded(value)


def encode_requested_transport() -> bytes:
    return encode_attribute(ATTR_REQUESTED_TRANSPORT, struct.pack("!Bxxx", TRANSPORT_UDP))


def long_term_key(username: str, realm: str, password: str) -> bytes:
    return hashlib.md5(f"{username}:{realm}:{password}".encode("utf-8")).digest()


def encode_allocate_request(
    transaction_id: bytes,
    username: str | None = None,
    realm: str | None = None,
    nonce: str | None = None,
    password: str | None = None,
) -> bytes:
    attributes: list[bytes] = []
    if username and realm and nonce and password:
        attributes.extend(
            [
                encode_attribute(ATTR_USERNAME, username.encode("utf-8")),
                encode_attribute(ATTR_REALM, realm.encode("utf-8")),
                encode_attribute(ATTR_NONCE, nonce.encode("utf-8")),
            ]
        )
    attributes.append(encode_requested_transport())

    if username and realm and nonce and password:
        partial_body = b"".join(attributes)
        integrity_length = len(partial_body) + 24
        header = struct.pack("!HHI12s", ALLOCATE_REQUEST, integrity_length, MAGIC_COOKIE, transaction_id)
        digest = hmac.new(long_term_key(username, realm, password), header + partial_body, hashlib.sha1).digest()
        attributes.append(encode_attribute(ATTR_MESSAGE_INTEGRITY, digest))

    body = b"".join(attributes)
    return append_fingerprint(ALLOCATE_REQUEST, transaction_id, body)


def append_fingerprint(message_type: int, transaction_id: bytes, body: bytes) -> bytes:
    length_with_fingerprint = len(body) + 8
    header = struct.pack("!HHI12s", message_type, length_with_fingerprint, MAGIC_COOKIE, transaction_id)
    checksum = binascii.crc32(header + body) ^ 0x5354554E
    return header + body + encode_attribute(ATTR_FINGERPRINT, struct.pack("!I", checksum))


def parse_message(payload: bytes) -> StunMessage:
    if len(payload) < 20:
        raise RuntimeError("STUN response is shorter than the header")
    message_type, length, cookie = struct.unpack("!HHI", payload[:8])
    if cookie != MAGIC_COOKIE:
        raise RuntimeError("STUN response has an invalid magic cookie")
    body = payload[20 : 20 + length]
    attributes: list[StunAttribute] = []
    offset = 0
    while offset + 4 <= len(body):
        attr_type, attr_length = struct.unpack("!HH", body[offset : offset + 4])
        start = offset + 4
        end = start + attr_length
        attributes.append(StunAttribute(attr_type, body[start:end]))
        offset = end + ((4 - (attr_length % 4)) % 4)
    return StunMessage(type=message_type, transaction_id=payload[8:20], attributes=tuple(attributes))


def get_attr(message: StunMessage, attr_type: int) -> bytes | None:
    for attribute in message.attributes:
        if attribute.type == attr_type:
            return attribute.value
    return None


def decode_error_code(value: bytes | None) -> int | None:
    if not value or len(value) < 4:
        return None
    return (value[2] & 0x07) * 100 + value[3]


def decode_xor_relayed_address(value: bytes | None, transaction_id: bytes) -> str | None:
    if not value or len(value) < 8:
        return None
    family = value[1]
    xport = struct.unpack("!H", value[2:4])[0] ^ (MAGIC_COOKIE >> 16)
    if family == 0x01:
        xaddr = struct.unpack("!I", value[4:8])[0] ^ MAGIC_COOKIE
        return f"{socket.inet_ntoa(struct.pack('!I', xaddr))}:{xport}"
    if family == 0x02 and len(value) >= 20:
        mask = struct.pack("!I12s", MAGIC_COOKIE, transaction_id)
        address = bytes(a ^ b for a, b in zip(value[4:20], mask))
        return f"[{socket.inet_ntop(socket.AF_INET6, address)}]:{xport}"
    return None


def send_turn_message(target: TurnTarget, payload: bytes, timeout: float) -> bytes:
    sock_type = socket.SOCK_DGRAM if target.transport == "udp" else socket.SOCK_STREAM
    with socket.socket(socket.AF_INET, sock_type) as client:
        client.settimeout(timeout)
        if target.transport == "tcp":
            client.connect((target.host, target.port))
            client.sendall(payload)
            return client.recv(2048)
        client.sendto(payload, (target.host, target.port))
        return client.recv(2048)


def run_turn_allocate(target: TurnTarget, username: str, password: str, timeout: float) -> str:
    challenge = parse_message(send_turn_message(target, encode_allocate_request(secrets.token_bytes(12)), timeout))
    if challenge.type != ALLOCATE_ERROR_RESPONSE or decode_error_code(get_attr(challenge, ATTR_ERROR_CODE)) != 401:
        raise RuntimeError("TURN server did not return the expected long-term credential challenge")

    authenticated = None
    for _ in range(3):
        realm = get_attr(challenge, ATTR_REALM)
        nonce = get_attr(challenge, ATTR_NONCE)
        if not realm or not nonce:
            raise RuntimeError("TURN challenge did not include realm and nonce")

        authenticated = parse_message(
            send_turn_message(
                target,
                encode_allocate_request(
                    transaction_id=secrets.token_bytes(12),
                    username=username,
                    realm=realm.decode("utf-8"),
                    nonce=nonce.decode("utf-8"),
                    password=password,
                ),
                timeout,
            )
        )
        if authenticated.type == ALLOCATE_SUCCESS_RESPONSE:
            break
        if authenticated.type == ALLOCATE_ERROR_RESPONSE and decode_error_code(get_attr(authenticated, ATTR_ERROR_CODE)) == 438:
            challenge = authenticated
            continue
        error_code = decode_error_code(get_attr(authenticated, ATTR_ERROR_CODE))
        raise RuntimeError(f"TURN allocation failed with error={error_code or 'unknown'}")

    if authenticated is None or authenticated.type != ALLOCATE_SUCCESS_RESPONSE:
        raise RuntimeError("TURN allocation failed after retrying stale nonce challenges")

    relay = decode_xor_relayed_address(get_attr(authenticated, ATTR_XOR_RELAYED_ADDRESS), authenticated.transaction_id)
    if not relay:
        raise RuntimeError("TURN allocation succeeded but did not return XOR-RELAYED-ADDRESS")
    return relay


def run_static_check() -> int:
    target = parse_turn_url(DEFAULT_TURN_URL)
    sample = encode_allocate_request(b"123456789012")
    message_type, _, cookie = struct.unpack("!HHI", sample[:8])
    if target.transport != "udp" or message_type != ALLOCATE_REQUEST or cookie != MAGIC_COOKIE:
        raise RuntimeError("TURN smoke static contract failed")
    print("TURN relay smoke check passed")
    print(f"Default TURN URL: {DEFAULT_TURN_URL}")
    print("Live mode verifies 401 challenge, MESSAGE-INTEGRITY, and XOR-RELAYED-ADDRESS allocation")
    return 0


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate TURN long-term credential allocation.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="Run static parser/request contract checks.")
    mode.add_argument("--run", action="store_true", help="Run live TURN Allocate against a server.")
    parser.add_argument("--turn-url", default=os.getenv("WEBRTC_TURN_URL", DEFAULT_TURN_URL))
    parser.add_argument("--username", default=os.getenv("WEBRTC_TURN_USERNAME"))
    parser.add_argument("--password", default=os.getenv("WEBRTC_TURN_PASSWORD"))
    parser.add_argument("--timeout-seconds", type=float, default=5)
    args = parser.parse_args(argv)
    if not args.check and not args.run:
        args.check = True
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        if args.check:
            return run_static_check()
        if not args.username or not args.password:
            raise RuntimeError("WEBRTC_TURN_USERNAME and WEBRTC_TURN_PASSWORD are required for --run")
        target = parse_turn_url(args.turn_url)
        relay = run_turn_allocate(target, args.username, args.password, args.timeout_seconds)
        print("TURN relay smoke run passed")
        print(f"TURN URL: {args.turn_url}")
        print(f"Relay address: {relay}")
        return 0
    except Exception as error:
        print(f"TURN relay smoke failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
