# Structured automation

Keep stdout for successful command results and parse expected failures from stderr.

## Failure document

```json
{
  "code": "NOT_FOUND",
  "message": "Issue HULY-404 was not found.",
  "retryable": false,
  "hint": "Optional next action",
  "details": { "tag": "IssueNotFoundError" }
}
```

`hint` and `details` are optional. Secret values are never part of the contract.

| Code | Class | Exit status |
| --- | --- | ---: |
| `INVALID_INPUT` | input | 2 |
| `AUTHENTICATION_FAILED` | authentication | 3 |
| `AUTHORIZATION_DENIED` | authorization | 4 |
| `NOT_FOUND` | lookup | 5 |
| `AMBIGUOUS_RESULT` | ambiguity | 5 |
| `CONFLICT` | conflict | 5 |
| `INTEGRATION_FAILED` | integration | 1 |
| `INTERNAL_ERROR` | internal | 70 |

Exit status 70 distinguishes an internal CLI defect. Retry only when `retryable` is true, and never blindly retry a consequential write.

## Shell pattern

```bash
result_file="$(mktemp)"
error_file="$(mktemp)"
if huly issues list --project HULY --json >"$result_file" 2>"$error_file"; then
  jq '.[] | {identifier, title, status}' "$result_file"
else
  jq '{code, message, retryable, hint}' "$error_file" >&2
fi
```

Use temporary files or another mechanism that preserves stdout/stderr separation. Do not merge streams before parsing.
