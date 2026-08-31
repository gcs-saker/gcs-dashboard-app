package httpapi

import (
	"context"
	"errors"
	"net/http"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

func (s Server) authorizedStreamListResponse(
	r *http.Request,
	streams []domain.StreamDescriptor,
) ([]streamDescriptorResponse, error) {
	payload := make([]streamDescriptorResponse, 0, len(streams))
	for _, stream := range streams {
		parsed, err := domain.ParseStreamPath(string(stream.Path))
		if err != nil {
			continue
		}
		err = s.requireStreamAccess(r.Context(), r.Header.Get(authorizationHeader), parsed)
		if errors.Is(err, domain.ErrStreamAccessDenied) {
			continue
		}
		if err != nil {
			return nil, err
		}
		payload = append(payload, s.streamDescriptorResponseFromParsed(stream, parsed))
	}
	return payload, nil
}

func (s Server) findStream(ctx context.Context, streamID string) (domain.StreamDescriptor, bool, error) {
	parsed, err := domain.ParseStreamID(streamID)
	if err != nil {
		return domain.StreamDescriptor{}, false, err
	}

	streams, err := s.listStreams(ctx)
	if err != nil {
		return domain.StreamDescriptor{}, false, err
	}
	for _, stream := range streams {
		streamPath, err := domain.ParseStreamPath(string(stream.Path))
		if err != nil {
			continue
		}
		if streamPath.StreamID == parsed.StreamID {
			return stream, true, nil
		}
	}
	return domain.StreamDescriptor{}, false, nil
}

func (s Server) authorizeDashboardStream(
	ctx context.Context,
	authorization string,
	stream domain.StreamDescriptor,
) (domain.ParsedStreamPath, error) {
	parsed, err := domain.ParseStreamPath(string(stream.Path))
	if err != nil {
		return domain.ParsedStreamPath{}, err
	}
	return parsed, s.requireStreamAccess(ctx, authorization, parsed)
}

func (s Server) requireStreamAccess(
	ctx context.Context,
	authorization string,
	parsed domain.ParsedStreamPath,
) error {
	_, err := s.authorizer.AuthorizeStream(ctx, authorization, s.groups.TargetFor(parsed))
	return err
}

func (s Server) requireTalkbackSendAccess(
	ctx context.Context,
	authorization string,
	parsed domain.ParsedStreamPath,
) error {
	target := s.groups.TargetFor(parsed)
	target.Action = "send_talkback"
	_, err := s.authorizer.AuthorizeStream(ctx, authorization, target)
	return err
}
