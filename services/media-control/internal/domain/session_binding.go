package domain

import "context"

type SessionBindingValidator interface {
	ValidateSessionBinding(context.Context, PublishSession) error
}
