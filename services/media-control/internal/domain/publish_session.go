package domain

import (
	"context"
	"crypto/subtle"
	"errors"
	"sort"
	"sync"
	"time"
)

var (
	ErrPublishSessionNotFound = errors.New("publish session not found")
	ErrPublishSessionStoreUnavailable = errors.New("publish session store unavailable")
)

type PublishSessionStatus string

const (
	PublishSessionActive PublishSessionStatus = "active"
	PublishSessionEnded  PublishSessionStatus = "ended"
)

type PublishSession struct {
	SessionID                string
	DeviceUUID               string
	SensorID                 string
	StreamID                 string
	Path                     string
	GroupID                  string
	CredentialVersion        int64
	DevicePolicyVersion      int64
	Status                   PublishSessionStatus
	RenewalTokenHash         []byte
	PreviousRenewalTokenHash []byte
	RenewalTokenVersion      int64
	PublishTokenExpiresAt    time.Time
	RenewalTokenExpiresAt    time.Time
	CreatedAt                time.Time
	UpdatedAt                time.Time
}

type RenewalRotationResult string

const (
	RenewalRotated  RenewalRotationResult = "rotated"
	RenewalReplayed RenewalRotationResult = "replayed"
	RenewalRejected RenewalRotationResult = "rejected"
)

func (s PublishSession) ActiveAt(now time.Time) bool {
	return s.Status == PublishSessionActive && now.Before(s.RenewalTokenExpiresAt)
}

type PublishSessionStore interface {
	Save(context.Context, PublishSession) error
	Find(context.Context, string) (PublishSession, error)
	RotateRenewal(context.Context, string, []byte, []byte, time.Time, time.Time, time.Time) (PublishSession, RenewalRotationResult, error)
	End(context.Context, string, time.Time) error
}

type InMemoryPublishSessionStore struct {
	mu       sync.RWMutex
	sessions map[string]PublishSession
}

func NewInMemoryPublishSessionStore() *InMemoryPublishSessionStore {
	return &InMemoryPublishSessionStore{sessions: make(map[string]PublishSession)}
}

func (s *InMemoryPublishSessionStore) Save(_ context.Context, session PublishSession) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[session.SessionID] = clonePublishSession(session)
	return nil
}

func (s *InMemoryPublishSessionStore) Find(_ context.Context, sessionID string) (PublishSession, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	session, ok := s.sessions[sessionID]
	if !ok { return PublishSession{}, ErrPublishSessionNotFound }
	return clonePublishSession(session), nil
}

func (s *InMemoryPublishSessionStore) RotateRenewal(_ context.Context, sessionID string, expectedHash, nextHash []byte, publishExpiry, renewalExpiry, now time.Time) (PublishSession, RenewalRotationResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.sessions[sessionID]
	if !ok || !session.ActiveAt(now) {
		return PublishSession{}, RenewalRejected, nil
	}
	if subtle.ConstantTimeCompare(session.PreviousRenewalTokenHash, expectedHash) == 1 {
		session.Status = PublishSessionEnded
		session.UpdatedAt = now
		s.sessions[sessionID] = session
		return clonePublishSession(session), RenewalReplayed, nil
	}
	if subtle.ConstantTimeCompare(session.RenewalTokenHash, expectedHash) != 1 {
		return PublishSession{}, RenewalRejected, nil
	}
	session.PreviousRenewalTokenHash = append([]byte(nil), session.RenewalTokenHash...)
	session.RenewalTokenHash = append([]byte(nil), nextHash...)
	session.RenewalTokenVersion++
	session.PublishTokenExpiresAt = publishExpiry
	session.RenewalTokenExpiresAt = renewalExpiry
	session.UpdatedAt = now
	s.sessions[sessionID] = session
	return clonePublishSession(session), RenewalRotated, nil
}

func (s *InMemoryPublishSessionStore) End(_ context.Context, sessionID string, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.sessions[sessionID]
	if !ok {
		return ErrPublishSessionNotFound
	}
	session.Status = PublishSessionEnded
	session.UpdatedAt = now
	s.sessions[sessionID] = session
	return nil
}

func clonePublishSession(session PublishSession) PublishSession {
	session.RenewalTokenHash = append([]byte(nil), session.RenewalTokenHash...)
	session.PreviousRenewalTokenHash = append([]byte(nil), session.PreviousRenewalTokenHash...)
	return session
}

func SortedSessionIDs(values map[string]PublishSession) []string {
	ids := make([]string, 0, len(values))
	for id := range values {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}
