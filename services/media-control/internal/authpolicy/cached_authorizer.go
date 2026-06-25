package authpolicy

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sync"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type Authorizer interface {
	AuthorizeStream(
		ctx context.Context,
		authorization string,
		target domain.StreamAccessTarget,
	) (domain.StreamAccessDecision, error)
}

type CachedAuthorizer struct {
	next Authorizer
	ttl  time.Duration
	now  func() time.Time

	mu      sync.Mutex
	entries map[string]cachedDecision
}

type cachedDecision struct {
	decision  domain.StreamAccessDecision
	expiresAt time.Time
}

func NewCachedAuthorizer(next Authorizer, ttl time.Duration) CachedAuthorizer {
	return CachedAuthorizer{
		next:    next,
		ttl:     ttl,
		now:     time.Now,
		entries: map[string]cachedDecision{},
	}
}

func (c *CachedAuthorizer) AuthorizeStream(
	ctx context.Context,
	authorization string,
	target domain.StreamAccessTarget,
) (domain.StreamAccessDecision, error) {
	if c.ttl <= 0 {
		return c.next.AuthorizeStream(ctx, authorization, target)
	}

	key := cacheKey(authorization, target)
	now := c.now()
	c.mu.Lock()
	entry, found := c.entries[key]
	if found && now.Before(entry.expiresAt) {
		c.mu.Unlock()
		return entry.decision, nil
	}
	if found {
		delete(c.entries, key)
	}
	c.mu.Unlock()

	decision, err := c.next.AuthorizeStream(ctx, authorization, target)
	if err != nil && !errors.Is(err, domain.ErrStreamAccessDenied) {
		return decision, err
	}

	expiresAt := now.Add(c.ttl)
	if decision.ExpiresAt != nil && decision.ExpiresAt.Before(expiresAt) {
		expiresAt = *decision.ExpiresAt
	}
	if expiresAt.After(now) {
		c.mu.Lock()
		c.entries[key] = cachedDecision{decision: decision, expiresAt: expiresAt}
		c.mu.Unlock()
	}
	return decision, err
}

func cacheKey(authorization string, target domain.StreamAccessTarget) string {
	sum := sha256.Sum256([]byte(authorization + "\x00" + target.StreamID + "\x00" + target.Path + "\x00" + target.PublisherGroupID))
	return hex.EncodeToString(sum[:])
}
