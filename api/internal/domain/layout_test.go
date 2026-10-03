package domain

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func leaf(id string) string {
	return fmt.Sprintf(`{"kind":"view","id":%q,"view":{"type":"timeline","config":{}}}`, id)
}

func doc(root string) string { return `{"version":1,"root":` + root + `}` }

// nested builds a chain of row splits `depth` levels deep.
func nested(depth int) string {
	node := leaf("leaf-0")
	for i := 1; i < depth; i++ {
		node = fmt.Sprintf(`{"kind":"split","id":"s-%d","direction":"row","sizes":[0.5,0.5],"children":[%s,%s]}`,
			i, node, leaf(fmt.Sprintf("leaf-%d", i)))
	}
	return node
}

func wide(n int) string {
	children := make([]string, n)
	sizes := make([]string, n)
	for i := range n {
		children[i] = leaf(fmt.Sprintf("v-%d", i))
		sizes[i] = fmt.Sprintf("%g", 1.0/float64(n))
	}
	return fmt.Sprintf(`{"kind":"split","id":"root","direction":"row","sizes":[%s],"children":[%s]}`,
		strings.Join(sizes, ","), strings.Join(children, ","))
}

func TestDefaultLayoutIsValid(t *testing.T) {
	if err := ValidateLayout(DefaultLayout()); err != nil {
		t.Fatalf("default layout invalid: %v", err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(DefaultLayout(), &parsed); err != nil {
		t.Fatal(err)
	}
}

func TestValidateLayout(t *testing.T) {
	two := func(a, b string, sizes string) string {
		return `{"kind":"split","id":"s","direction":"row","sizes":` + sizes + `,"children":[` + a + `,` + b + `]}`
	}
	tests := []struct {
		name  string
		raw   string
		valid bool
	}{
		{"empty workspace", doc(`null`), true},
		{"single view", doc(leaf("a")), true},
		{"dropbox config", doc(`{"kind":"view","id":"a","view":{"type":"dropbox","config":{"filter":"unscheduled"}}}`), true},
		{"dropbox sections", doc(`{"kind":"view","id":"a","view":{"type":"dropbox","config":{"sections":["scheduled","unscheduled"]}}}`), true},
		{"dropbox all sections", doc(`{"kind":"view","id":"a","view":{"type":"dropbox","config":{"sections":["completed","scheduled","unscheduled"]}}}`), true},
		{"calendar config", doc(`{"kind":"view","id":"a","view":{"type":"calendar","config":{"mode":"day"}}}`), true},
		{"sizes within tolerance", doc(two(leaf("a"), leaf("b"), `[0.505,0.5]`)), true},
		{"depth 8 ok", doc(nested(8)), true},
		{"24 views ok", doc(wide(24)), true},
		{"missing version", `{"root":null}`, false},
		{"version 2", `{"version":2,"root":null}`, false},
		{"extra top-level key", `{"version":1,"root":null,"x":1}`, false},
		{"not an object", `[]`, false},
		{"duplicate ids", doc(two(leaf("a"), leaf("a"), `[0.5,0.5]`)), false},
		{"split with one child", doc(`{"kind":"split","id":"s","direction":"row","sizes":[1],"children":[` + leaf("a") + `]}`), false},
		{"sizes length mismatch", doc(two(leaf("a"), leaf("b"), `[1]`)), false},
		{"sizes do not sum to 1", doc(two(leaf("a"), leaf("b"), `[0.5,0.4]`)), false},
		{"zero size", doc(two(leaf("a"), leaf("b"), `[1,0]`)), false},
		{"bad direction", doc(`{"kind":"split","id":"s","direction":"diagonal","sizes":[0.5,0.5],"children":[` + leaf("a") + `,` + leaf("b") + `]}`), false},
		{"unknown kind", doc(`{"kind":"tab","id":"a"}`), false},
		{"unknown view type", doc(`{"kind":"view","id":"a","view":{"type":"kanban","config":{}}}`), false},
		{"bad dropbox filter", doc(`{"kind":"view","id":"a","view":{"type":"dropbox","config":{"filter":"later"}}}`), false},
		{"dropbox no sections", doc(`{"kind":"view","id":"a","view":{"type":"dropbox","config":{"sections":[]}}}`), false},
		{"dropbox duplicate section", doc(`{"kind":"view","id":"a","view":{"type":"dropbox","config":{"sections":["completed","completed"]}}}`), false},
		{"dropbox unknown section", doc(`{"kind":"view","id":"a","view":{"type":"dropbox","config":{"sections":["all"]}}}`), false},
		{"dropbox filter and sections", doc(`{"kind":"view","id":"a","view":{"type":"dropbox","config":{"filter":"all","sections":["completed"]}}}`), false},
		{"timeline config has keys", doc(`{"kind":"view","id":"a","view":{"type":"timeline","config":{"zoom":2}}}`), false},
		{"calendar missing mode", doc(`{"kind":"view","id":"a","view":{"type":"calendar","config":{}}}`), false},
		{"config null", doc(`{"kind":"view","id":"a","view":{"type":"timeline","config":null}}`), false},
		{"empty id", doc(leaf("")), false},
		{"depth 9 rejected", doc(nested(9)), false},
		{"25 views rejected", doc(wide(25)), false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateLayout(json.RawMessage(tc.raw))
			if tc.valid && err != nil {
				t.Fatalf("want valid, got %v", err)
			}
			if !tc.valid {
				assertField(t, err, "layout")
			}
		})
	}
}
