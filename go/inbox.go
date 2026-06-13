package nitroping

import (
	"context"
	"errors"
	"net/url"
	"strconv"
)

// InboxService wraps the /api/v1/public/inbox endpoints — the in-app
// notification center. Like EventsService, these authenticate with a
// public (pk_) key and act on behalf of a signed-in end user identified
// by userID (the same opaque id passed at device registration). A secret
// API key works too.
//
// Construct one via NewClient.
type InboxService struct {
	transport *transport
}

// InboxListOption customises InboxService.List. Construct with
// WithUnreadOnly and WithLimit.
type InboxListOption func(*inboxListConfig)

type inboxListConfig struct {
	unreadOnly *bool
	limit      *int
}

// WithUnreadOnly restricts List to unread items only (or includes all
// when false). Omitted from the query when this option isn't passed.
func WithUnreadOnly(unreadOnly bool) InboxListOption {
	return func(c *inboxListConfig) { c.unreadOnly = &unreadOnly }
}

// WithLimit caps the number of items returned by List. Omitted from the
// query when this option isn't passed.
func WithLimit(limit int) InboxListOption {
	return func(c *inboxListConfig) { c.limit = &limit }
}

func applyInboxListOptions(opts []InboxListOption) inboxListConfig {
	cfg := inboxListConfig{}
	for _, opt := range opts {
		if opt == nil {
			continue
		}
		opt(&cfg)
	}
	return cfg
}

// List returns a user's inbox, newest first. userID is required.
//
//	items, err := client.Inbox.List(ctx, "user-42",
//	    nitroping.WithUnreadOnly(true), nitroping.WithLimit(20))
func (s *InboxService) List(
	ctx context.Context,
	userID string,
	opts ...InboxListOption,
) ([]InboxItem, error) {
	if userID == "" {
		return nil, errors.New("nitroping: user id is required")
	}
	cfg := applyInboxListOptions(opts)

	q := url.Values{}
	q.Set("user_id", userID)
	if cfg.unreadOnly != nil {
		q.Set("unread_only", strconv.FormatBool(*cfg.unreadOnly))
	}
	if cfg.limit != nil {
		q.Set("limit", strconv.Itoa(*cfg.limit))
	}
	path := "/api/v1/public/inbox?" + q.Encode()

	var out struct {
		Items []InboxItem `json:"items"`
	}
	if err := s.transport.do(ctx, "GET", path, nil, applyOptions(nil), &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

// UnreadCount returns the number of unread inbox items for a user.
// userID is required.
func (s *InboxService) UnreadCount(
	ctx context.Context,
	userID string,
	opts ...RequestOption,
) (int, error) {
	if userID == "" {
		return 0, errors.New("nitroping: user id is required")
	}
	q := url.Values{}
	q.Set("user_id", userID)
	path := "/api/v1/public/inbox/unread_count?" + q.Encode()

	var out struct {
		UnreadCount int `json:"unread_count"`
	}
	if err := s.transport.do(ctx, "GET", path, nil, applyOptions(opts), &out); err != nil {
		return 0, err
	}
	return out.UnreadCount, nil
}

// MarkRead marks a single inbox item read and returns the updated item.
// userID and itemID are required.
func (s *InboxService) MarkRead(
	ctx context.Context,
	userID, itemID string,
	opts ...RequestOption,
) (*InboxItem, error) {
	if userID == "" {
		return nil, errors.New("nitroping: user id is required")
	}
	if itemID == "" {
		return nil, errors.New("nitroping: item id is required")
	}
	body := map[string]any{"user_id": userID}
	path := "/api/v1/public/inbox/" + url.PathEscape(itemID) + "/read"

	var out InboxItem
	if err := s.transport.do(ctx, "POST", path, body, applyOptions(opts), &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// MarkAllRead marks every unread inbox item read for a user and returns
// the number of items updated. userID is required.
func (s *InboxService) MarkAllRead(
	ctx context.Context,
	userID string,
	opts ...RequestOption,
) (int, error) {
	if userID == "" {
		return 0, errors.New("nitroping: user id is required")
	}
	body := map[string]any{"user_id": userID}

	var out struct {
		MarkedRead int `json:"marked_read"`
	}
	if err := s.transport.do(ctx, "POST", "/api/v1/public/inbox/read_all", body, applyOptions(opts), &out); err != nil {
		return 0, err
	}
	return out.MarkedRead, nil
}
