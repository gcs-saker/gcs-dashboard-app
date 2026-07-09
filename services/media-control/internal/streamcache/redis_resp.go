package streamcache

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
)

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
		return readRESPBulkString(reader, line)
	case '*':
		return readRESPArray(reader, line)
	default:
		return nil, fmt.Errorf("unsupported redis response prefix %q", prefix)
	}
}

func readRESPBulkString(reader *bufio.Reader, line string) (any, error) {
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
}

func readRESPArray(reader *bufio.Reader, line string) (any, error) {
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
}
