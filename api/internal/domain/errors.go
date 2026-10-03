package domain

// ValidationError is returned for any input that violates a domain rule.
// The HTTP layer maps it to 400 validation_failed.
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string { return e.Field + ": " + e.Message }

func invalid(field, message string) error {
	return &ValidationError{Field: field, Message: message}
}
