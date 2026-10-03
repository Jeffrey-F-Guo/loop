package domain

import (
	"bytes"
	"encoding/json"
)

// Opt distinguishes an absent JSON field (Set=false), an explicit null
// (Set=true, Null=true), and a present value. encoding/json only calls
// UnmarshalJSON for keys that are present, so absent fields stay zero.
type Opt[T any] struct {
	Set   bool
	Null  bool
	Value T
}

func (o *Opt[T]) UnmarshalJSON(b []byte) error {
	o.Set = true
	if bytes.Equal(bytes.TrimSpace(b), []byte("null")) {
		o.Null = true
		return nil
	}
	return json.Unmarshal(b, &o.Value)
}

func Some[T any](v T) Opt[T] { return Opt[T]{Set: true, Value: v} }
func Null[T any]() Opt[T]    { return Opt[T]{Set: true, Null: true} }
