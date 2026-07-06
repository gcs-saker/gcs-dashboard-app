package streamcache

import (
	"encoding/json"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

func decodeStreamList(payload string) (domain.StreamList, error) {
	var streams []domain.StreamDescriptor
	if err := json.Unmarshal([]byte(payload), &streams); err != nil {
		return domain.StreamList{}, err
	}
	return domain.NewStreamList(streams), nil
}

func encodeStreamList(streams domain.StreamList) (string, error) {
	payload, err := json.Marshal(streams.Values())
	if err != nil {
		return "", err
	}
	return string(payload), nil
}
