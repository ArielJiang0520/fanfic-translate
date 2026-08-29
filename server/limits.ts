// One request's worth of text. Long enough for a chapter, short enough that a paste of a whole
// book is rejected here rather than by the provider mid-stream. Shared, because a chapter that
// could be saved but never translated would be a trap.
export const MAX_TEXT_CHARS = 20_000
