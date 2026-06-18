package protocolv2

import (
	"fmt"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

const (
	streamSessionEventID                 = 1
	streamSessionStreamID                = 2
	streamSessionStreamPath              = 3
	streamSessionPublisherAssetID        = 4
	streamSessionGroupID                 = 5
	streamSessionState                   = 6
	streamSessionSource                  = "protobuf-v2"
	streamStatePublishing         uint64 = 1
	streamStatePlayable           uint64 = 2
	streamStateReconnecting       uint64 = 3
	streamStateStopped            uint64 = 4
	streamStateError              uint64 = 5
)

type StreamSessionEvent struct {
	EventID          string
	StreamID         string
	StreamPath       string
	PublisherAssetID string
	GroupID          string
	State            uint64
}

func DecodeStreamSessionEvent(payload []byte) (StreamSessionEvent, error) {
	message, err := DecodeWireMessage(payload)
	if err != nil {
		return StreamSessionEvent{}, err
	}
	eventID, err := message.SingleString(streamSessionEventID)
	if err != nil {
		return StreamSessionEvent{}, err
	}
	streamID, err := message.SingleString(streamSessionStreamID)
	if err != nil {
		return StreamSessionEvent{}, err
	}
	streamPath, err := message.SingleString(streamSessionStreamPath)
	if err != nil {
		return StreamSessionEvent{}, err
	}
	publisherAssetID, err := message.SingleString(streamSessionPublisherAssetID)
	if err != nil {
		return StreamSessionEvent{}, err
	}
	groupID, err := message.SingleString(streamSessionGroupID)
	if err != nil {
		return StreamSessionEvent{}, err
	}
	state, err := message.SingleUint64(streamSessionState)
	if err != nil {
		return StreamSessionEvent{}, err
	}
	return StreamSessionEvent{
		EventID:          eventID,
		StreamID:         streamID,
		StreamPath:       streamPath,
		PublisherAssetID: publisherAssetID,
		GroupID:          groupID,
		State:            state,
	}, nil
}

func (e StreamSessionEvent) ToStreamDescriptor() (domain.StreamDescriptor, error) {
	path, err := domain.NewStreamPath(e.StreamPath)
	if err != nil {
		return domain.StreamDescriptor{}, err
	}
	status, ready, err := streamStateToDescriptorState(e.State)
	if err != nil {
		return domain.StreamDescriptor{}, err
	}
	return domain.StreamDescriptor{
		Path:        path,
		Ready:       ready,
		Source:      streamSessionSource,
		Status:      status,
		ReaderCount: 0,
	}, nil
}

func streamStateToDescriptorState(state uint64) (domain.StreamStatus, bool, error) {
	switch state {
	case streamStatePublishing, streamStatePlayable:
		return domain.StreamStatusOnline, true, nil
	case streamStateReconnecting:
		return domain.StreamStatusUnknown, false, nil
	case streamStateStopped:
		return domain.StreamStatusOffline, false, nil
	case streamStateError:
		return domain.StreamStatusUnknown, false, nil
	default:
		return "", false, fmt.Errorf("unsupported stream state: %d", state)
	}
}
