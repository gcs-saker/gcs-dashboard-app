package authpolicy

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

const authPolicyControlAccessPath = "/policy/control/access"

type ControlAccessTarget struct {
	Action, DeviceID, Command, ControlSessionID string
	HighRiskConfirmed                           bool
	Now                                         time.Time
	Lease                                       *ControlLeaseTarget
}

type ControlLeaseTarget struct {
	ControlSessionID, DeviceID, Username string
	ExpiresAt                            time.Time
}

type ControlAccessDecision struct {
	Allowed bool   `json:"allowed"`
	Reason  string `json:"reason"`
	GroupID string `json:"groupId"`
}

func (c Client) AuthorizeControl(ctx context.Context, authorization string, target ControlAccessTarget) (ControlAccessDecision, error) {
	payload := controlAccessPayload{Action: target.Action, DeviceID: target.DeviceID, Command: target.Command,
		ControlSessionID: target.ControlSessionID, HighRiskConfirmed: target.HighRiskConfirmed, NowUnixMillis: target.Now.UnixMilli()}
	if target.Lease != nil {
		payload.Lease = &controlLeasePayload{target.Lease.ControlSessionID, target.Lease.DeviceID,
			target.Lease.Username, target.Lease.ExpiresAt.UnixMilli()}
	}
	response, err := c.postJSON(ctx, authPolicyControlAccessPath, payload, authorization)
	if err != nil {
		return ControlAccessDecision{}, err
	}
	defer response.Body.Close()
	if response.StatusCode == 401 || response.StatusCode == 403 {
		return ControlAccessDecision{}, fmt.Errorf("control authorization denied")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return ControlAccessDecision{}, fmt.Errorf("control authorization unavailable")
	}
	var decision ControlAccessDecision
	if json.NewDecoder(response.Body).Decode(&decision) != nil || !decision.Allowed {
		return decision, fmt.Errorf("control authorization denied")
	}
	return decision, nil
}

type controlAccessPayload struct {
	Action            string               `json:"action"`
	DeviceID          string               `json:"deviceId"`
	Command           string               `json:"command"`
	ControlSessionID  string               `json:"controlSessionId,omitempty"`
	HighRiskConfirmed bool                 `json:"highRiskConfirmed"`
	NowUnixMillis     int64                `json:"nowUnixMillis"`
	Lease             *controlLeasePayload `json:"lease,omitempty"`
}

type controlLeasePayload struct {
	ControlSessionID  string `json:"controlSessionId"`
	DeviceID          string `json:"deviceId"`
	Username          string `json:"username"`
	ExpiresUnixMillis int64  `json:"expiresUnixMillis"`
}
