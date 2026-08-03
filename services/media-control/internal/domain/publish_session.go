package domain

import (
	"crypto/subtle"
	"sort"
	"sync"
	"time"
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
	Save(session PublishSession) error
	Find(sessionID string) (PublishSession, bool)
	RotateRenewal(sessionID string, expectedHash []byte, nextHash []byte, publishExpiry, renewalExpiry, now time.Time) (PublishSession, RenewalRotationResult)
	End(sessionID string, now time.Time) bool
}

type InMemoryPublishSessionStore struct {
	mu       sync.RWMutex
	sessions map[string]PublishSession
}

func NewInMemoryPublishSessionStore() *InMemoryPublishSessionStore {
	return &InMemoryPublishSessionStore{sessions: make(map[string]PublishSession)}
}

func (s *InMemoryPublishSessionStore) Save(session PublishSession) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[session.SessionID] = clonePublishSession(session)
	return nil
}

func (s *InMemoryPublishSessionStore) Find(sessionID string) (PublishSession, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	session, ok := s.sessions[sessionID]
	return clonePublishSession(session), ok
}

func (s *InMemoryPublishSessionStore) RotateRenewal(sessionID string, expectedHash, nextHash []byte, publishExpiry, renewalExpiry, now time.Time) (PublishSession, RenewalRotationResult) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.sessions[sessionID]
	if !ok || !session.ActiveAt(now) {
		return PublishSession{}, RenewalRejected
	}
	if subtle.ConstantTimeCompare(session.PreviousRenewalTokenHash, expectedHash) == 1 {
		session.Status = PublishSessionEnded
		session.UpdatedAt = now
		s.sessions[sessionID] = session
		return clonePublishSession(session), RenewalReplayed
	}
	if subtle.ConstantTimeCompare(session.RenewalTokenHash, expectedHash) != 1 {
		return PublishSession{}, RenewalRejected
	}
	session.PreviousRenewalTokenHash = append([]byte(nil), session.RenewalTokenHash...)
	session.RenewalTokenHash = append([]byte(nil), nextHash...)
	session.RenewalTokenVersion++
	session.PublishTokenExpiresAt = publishExpiry
	session.RenewalTokenExpiresAt = renewalExpiry
	session.UpdatedAt = now
	s.sessions[sessionID] = session
	return clonePublishSession(session), RenewalRotated
}

func (s *InMemoryPublishSessionStore) End(sessionID string, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.sessions[sessionID]
	if !ok {
		return false
	}
	session.Status = PublishSessionEnded
	session.UpdatedAt = now
	s.sessions[sessionID] = session
	return true
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
