package domain

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrStreamAuthenticationRequired = errors.New("stream authentication required")
	ErrStreamAccessDenied           = errors.New("stream access denied")
)

const (
	controlPlaneIceServersStreamID = "control.ice-servers"
	controlPlaneIceServersPath     = "control/ice-servers"
	controlPlaneStreamListStreamID = "control.stream-list"
	controlPlaneStreamListPath     = "control/stream-list"
)

type StreamAccessTarget struct {
	StreamID         string `json:"streamId"`
	Path             string `json:"path"`
	PublisherGroupID string `json:"publisherGroupId"`
	Action           string `json:"action,omitempty"`
}

type StreamAccessDecision struct {
	StreamID         string     `json:"streamId"`
	Allowed          bool       `json:"allowed"`
	Reason           string     `json:"reason"`
	PrincipalID      string     `json:"principalId,omitempty"`
	GroupID          string     `json:"groupId,omitempty"`
	ExpiresAt        *time.Time `json:"expiresAt,omitempty"`
	PolicyVersion    string     `json:"policyVersion,omitempty"`
	PrincipalVersion string     `json:"principalVersion,omitempty"`
}

func AllowStream(streamID string, reason string) StreamAccessDecision {
	return StreamAccessDecision{StreamID: streamID, Allowed: true, Reason: reason}
}

func DenyStream(streamID string, reason string) StreamAccessDecision {
	return StreamAccessDecision{StreamID: streamID, Allowed: false, Reason: reason}
}

type StreamGroupResolver struct {
	defaultGroupID string
	mappings       StreamGroupMappings
}

type StreamGroupMappings struct {
	valuesByRoute map[string]string
}

func NewStreamGroupMappings(encodedMappings string) (StreamGroupMappings, error) {
	mappings := map[string]string{}
	for _, item := range strings.Split(encodedMappings, ",") {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		key, value, ok := strings.Cut(item, "=")
		if !ok {
			return StreamGroupMappings{}, fmt.Errorf("stream group mapping must use path=group format")
		}
		parsed, err := ParseStreamIDOrPath(strings.TrimSpace(key))
		if err != nil {
			return StreamGroupMappings{}, err
		}
		groupID := strings.TrimSpace(value)
		if groupID == "" {
			return StreamGroupMappings{}, fmt.Errorf("stream group mapping group id must not be blank")
		}
		mappings[parsed.Path] = groupID
		mappings[parsed.StreamID] = groupID
	}
	return StreamGroupMappings{valuesByRoute: mappings}, nil
}

func (m StreamGroupMappings) Find(stream ParsedStreamPath) (string, bool) {
	if mappedGroupID, ok := m.valuesByRoute[stream.Path]; ok {
		return mappedGroupID, true
	}
	if mappedGroupID, ok := m.valuesByRoute[stream.StreamID]; ok {
		return mappedGroupID, true
	}
	return "", false
}

func NewStreamGroupResolver(defaultGroupID string, encodedMappings string) (StreamGroupResolver, error) {
	defaultGroupID = strings.TrimSpace(defaultGroupID)
	if defaultGroupID == "" {
		return StreamGroupResolver{}, fmt.Errorf("default publisher group id must not be blank")
	}
	mappings, err := NewStreamGroupMappings(encodedMappings)
	if err != nil {
		return StreamGroupResolver{}, err
	}
	return StreamGroupResolver{defaultGroupID: defaultGroupID, mappings: mappings}, nil
}

func (r StreamGroupResolver) TargetFor(stream ParsedStreamPath) StreamAccessTarget {
	publisherGroupID := r.defaultGroupID
	if mappedGroupID, ok := r.mappings.Find(stream); ok {
		publisherGroupID = mappedGroupID
	}
	return StreamAccessTarget{
		StreamID:         stream.StreamID,
		Path:             stream.Path,
		PublisherGroupID: publisherGroupID,
	}
}

func (r StreamGroupResolver) IceServersTarget() StreamAccessTarget {
	return StreamAccessTarget{
		StreamID:         controlPlaneIceServersStreamID,
		Path:             controlPlaneIceServersPath,
		PublisherGroupID: r.defaultGroupID,
	}
}

func (r StreamGroupResolver) StreamListTarget() StreamAccessTarget {
	return StreamAccessTarget{
		StreamID:         controlPlaneStreamListStreamID,
		Path:             controlPlaneStreamListPath,
		PublisherGroupID: r.defaultGroupID,
	}
}

func ParseStreamIDOrPath(value string) (ParsedStreamPath, error) {
	if strings.Contains(value, "/") {
		return ParseStreamPath(value)
	}
	return ParseStreamID(value)
}
