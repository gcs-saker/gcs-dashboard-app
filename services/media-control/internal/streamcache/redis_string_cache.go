package streamcache

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"
)

type RedisStringCache struct {
	addr     string
	password string
	timeout  time.Duration
}

func NewRedisStringCache(addr string, password string, timeout time.Duration) RedisStringCache {
	if timeout <= 0 {
		timeout = 500 * time.Millisecond
	}
	return RedisStringCache{addr: strings.TrimSpace(addr), password: password, timeout: timeout}
}

func (c RedisStringCache) Get(ctx context.Context, key string) (string, bool, error) {
	value, err := c.command(ctx, "GET", key)
	if err != nil {
		return "", false, err
	}
	if value == nil {
		return "", false, nil
	}
	text, ok := value.(string)
	if !ok {
		return "", false, fmt.Errorf("redis GET returned %T", value)
	}
	return text, true, nil
}

func (c RedisStringCache) Set(ctx context.Context, key string, value string, ttl time.Duration) error {
	seconds := int(ttl.Seconds())
	if seconds < 1 {
		seconds = 1
	}
	_, err := c.command(ctx, "SETEX", key, strconv.Itoa(seconds), value)
	return err
}

func (c RedisStringCache) command(ctx context.Context, args ...string) (any, error) {
	if c.addr == "" {
		return nil, errors.New("redis address is empty")
	}
	dialer := net.Dialer{Timeout: c.timeout}
	conn, err := dialer.DialContext(ctx, "tcp", c.addr)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	deadline := time.Now().Add(c.timeout)
	if ctxDeadline, ok := ctx.Deadline(); ok && ctxDeadline.Before(deadline) {
		deadline = ctxDeadline
	}
	if err := conn.SetDeadline(deadline); err != nil {
		return nil, fmt.Errorf("set redis connection deadline: %w", err)
	}

	reader := bufio.NewReader(conn)
	if c.password != "" {
		if _, err := conn.Write(encodeRESPCommand("AUTH", c.password)); err != nil {
			return nil, err
		}
		if _, err := readRESP(reader); err != nil {
			return nil, err
		}
	}
	if _, err := conn.Write(encodeRESPCommand(args...)); err != nil {
		return nil, err
	}
	return readRESP(reader)
}
