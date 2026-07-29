import { Schema } from "effect"

export class FilteredViewNotFoundError extends Schema.TaggedError<FilteredViewNotFoundError>()(
  "FilteredViewNotFoundError",
  { identifier: Schema.String }
) {
  override get message(): string {
    return `Filtered view '${this.identifier}' not found`
  }
}

export class FilteredViewIdentifierAmbiguousError extends Schema.TaggedError<FilteredViewIdentifierAmbiguousError>()(
  "FilteredViewIdentifierAmbiguousError",
  { identifier: Schema.String, matches: Schema.Number }
) {
  override get message(): string {
    return `Filtered view '${this.identifier}' matched ${this.matches} filtered views; pass a filtered view _id`
  }
}

export class ViewletNotFoundError extends Schema.TaggedError<ViewletNotFoundError>()("ViewletNotFoundError", {
  identifier: Schema.String
}) {
  override get message(): string {
    return `Viewlet '${this.identifier}' not found`
  }
}

export class ViewletIdentifierAmbiguousError extends Schema.TaggedError<ViewletIdentifierAmbiguousError>()(
  "ViewletIdentifierAmbiguousError",
  { identifier: Schema.String, matches: Schema.Number }
) {
  override get message(): string {
    return `Viewlet '${this.identifier}' matched ${this.matches} viewlets; pass a viewlet _id`
  }
}
