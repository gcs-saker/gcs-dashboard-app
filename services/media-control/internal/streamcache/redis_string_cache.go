package streamcache

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
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
	_ = conn.SetDeadline(deadline)

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

func encodeRESPCommand(args ...string) []byte {
	var buffer bytes.Buffer
	buffer.WriteString("*")
	buffer.WriteString(strconv.Itoa(len(args)))
	buffer.WriteString("\r\n")
	for _, arg := range args {
		buffer.WriteString("$")
		buffer.WriteString(strconv.Itoa(len(arg)))
		buffer.WriteString("\r\n")
		buffer.WriteString(arg)
		buffer.WriteString("\r\n")
	}
	return buffer.Bytes()
}

func readRESP(reader *bufio.Reader) (any, error) {
	prefix, err := reader.ReadByte()
	if err != nil {
		return nil, err
	}
	line, err := reader.ReadString('\n')
	if err != nil {
		return nil, err
	}
	line = strings.TrimSuffix(strings.TrimSuffix(line, "\n"), "\r")

	switch prefix {
	case '+':
		return line, nil
	case '-':
		return nil, errors.New(line)
	case ':':
		return strconv.ParseInt(line, 10, 64)
	case '$':
		size, err := strconv.Atoi(line)
		if err != nil {
			return nil, err
		}
		if size < 0 {
			return nil, nil
		}
		payload := make([]byte, size+2)
		if _, err := io.ReadFull(reader, payload); err != nil {
			return nil, err
		}
		return string(payload[:size]), nil
	case '*':
		size, err := strconv.Atoi(line)
		if err != nil {
			return nil, err
		}
		values := make([]any, 0, size)
		for range size {
			value, err := readRESP(reader)
			if err != nil {
				return nil, err
			}
			values = append(values, value)
		}
		return values, nil
	default:
		return nil, fmt.Errorf("unsupported redis response prefix %q", prefix)
	}
}
