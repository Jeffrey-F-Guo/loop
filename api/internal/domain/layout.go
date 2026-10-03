package domain

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"math"
	"time"
)

const (
	maxLayoutDepth = 8
	maxLayoutViews = 24
)

//go:embed default_layout.json
var defaultLayout []byte

type Workspace struct {
	Layout    json.RawMessage `json:"layout"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// DefaultLayout returns a fresh copy of the first-run layout (FEATURE_DESIGN §21).
func DefaultLayout() json.RawMessage {
	return append(json.RawMessage(nil), defaultLayout...)
}

func layoutErr(msg string) error { return invalid("layout", msg) }

func ValidateLayout(raw json.RawMessage) error {
	var doc struct {
		Version *int            `json:"version"`
		Root    json.RawMessage `json:"root"`
	}
	if !isJSONObject(raw) || strictDecode(raw, &doc) != nil {
		return layoutErr("layout is malformed")
	}
	if doc.Version == nil || *doc.Version != 1 {
		return layoutErr("layout version must be 1")
	}
	if len(doc.Root) == 0 || string(bytes.TrimSpace(doc.Root)) == "null" {
		return nil
	}
	v := &layoutValidator{ids: map[string]bool{}}
	return v.node(doc.Root, 1)
}

type layoutValidator struct {
	ids   map[string]bool
	views int
}

func (v *layoutValidator) claimID(id string) error {
	if id == "" {
		return layoutErr("node id is required")
	}
	if v.ids[id] {
		return layoutErr("node ids must be unique")
	}
	v.ids[id] = true
	return nil
}

func (v *layoutValidator) node(raw json.RawMessage, depth int) error {
	if depth > maxLayoutDepth {
		return layoutErr("layout is nested too deeply")
	}
	if !isJSONObject(raw) {
		return layoutErr("layout node must be an object")
	}
	var head struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(raw, &head); err != nil {
		return layoutErr("layout node is malformed")
	}
	switch head.Kind {
	case "split":
		var s struct {
			Kind      string            `json:"kind"`
			ID        string            `json:"id"`
			Direction string            `json:"direction"`
			Children  []json.RawMessage `json:"children"`
			Sizes     []float64         `json:"sizes"`
		}
		if strictDecode(raw, &s) != nil {
			return layoutErr("split node is malformed")
		}
		if err := v.claimID(s.ID); err != nil {
			return err
		}
		if s.Direction != "row" && s.Direction != "column" {
			return layoutErr("split direction must be row or column")
		}
		if len(s.Children) < 2 {
			return layoutErr("split must have at least two children")
		}
		if len(s.Sizes) != len(s.Children) {
			return layoutErr("split sizes must match children")
		}
		sum := 0.0
		for _, size := range s.Sizes {
			if size <= 0 {
				return layoutErr("split sizes must be positive")
			}
			sum += size
		}
		if math.Abs(sum-1) > 0.01 {
			return layoutErr("split sizes must sum to 1")
		}
		for _, child := range s.Children {
			if err := v.node(child, depth+1); err != nil {
				return err
			}
		}
		return nil
	case "view":
		var n struct {
			Kind string          `json:"kind"`
			ID   string          `json:"id"`
			View json.RawMessage `json:"view"`
		}
		if strictDecode(raw, &n) != nil {
			return layoutErr("view node is malformed")
		}
		if err := v.claimID(n.ID); err != nil {
			return err
		}
		v.views++
		if v.views > maxLayoutViews {
			return layoutErr("too many views")
		}
		return validateView(n.View)
	default:
		return layoutErr("unknown layout node kind")
	}
}

func validateView(raw json.RawMessage) error {
	var vi struct {
		Type   string          `json:"type"`
		Config json.RawMessage `json:"config"`
	}
	if !isJSONObject(raw) || strictDecode(raw, &vi) != nil || !isJSONObject(vi.Config) {
		return layoutErr("view is malformed")
	}
	switch vi.Type {
	case "dropbox":
		// sections: which of the three lists are shown. filter is the pre-sections shape,
		// still accepted so stored workspaces keep loading; the app rewrites it as sections.
		var c struct {
			Filter   *string   `json:"filter"`
			Sections *[]string `json:"sections"`
		}
		if strictDecode(vi.Config, &c) != nil || (c.Filter == nil) == (c.Sections == nil) {
			return layoutErr("dropbox config is malformed")
		}
		if c.Filter != nil {
			switch *c.Filter {
			case "all", "scheduled", "unscheduled", "completed":
				return nil
			}
			return layoutErr("dropbox filter is invalid")
		}
		seen := map[string]bool{}
		for _, s := range *c.Sections {
			if (s != "scheduled" && s != "unscheduled" && s != "completed") || seen[s] {
				return layoutErr("dropbox sections are invalid")
			}
			seen[s] = true
		}
		if len(seen) == 0 {
			return layoutErr("dropbox needs at least one section")
		}
		return nil
	case "timeline":
		var c struct{}
		if strictDecode(vi.Config, &c) != nil {
			return layoutErr("timeline config must be empty")
		}
		return nil
	case "calendar":
		var c struct {
			Mode string `json:"mode"`
		}
		if strictDecode(vi.Config, &c) != nil || (c.Mode != "week" && c.Mode != "day") {
			return layoutErr("calendar mode must be week or day")
		}
		return nil
	default:
		return layoutErr("unknown view type")
	}
}

func strictDecode(raw json.RawMessage, v any) error {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return err
	}
	if dec.More() {
		return errors.New("trailing data")
	}
	return nil
}

func isJSONObject(raw json.RawMessage) bool {
	t := bytes.TrimSpace(raw)
	return len(t) > 0 && t[0] == '{'
}
