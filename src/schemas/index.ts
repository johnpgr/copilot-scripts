// Schema is part of the core `effect` package (since v3.x).
// No need for the separate `@effect/schema` package.
import { Schema } from "effect";

export class DeviceCodeResponse extends Schema.Class<DeviceCodeResponse>(
  "DeviceCodeResponse",
)({
  device_code: Schema.String,
  user_code: Schema.String,
  verification_uri: Schema.String,
  interval: Schema.optionalWith(Schema.Number, { default: () => 5 }),
}) {}

export class AccessTokenResponse extends Schema.Class<AccessTokenResponse>(
  "AccessTokenResponse",
)({
  access_token: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  error_description: Schema.optional(Schema.String),
}) {}

export class BearerTokenResponse extends Schema.Class<BearerTokenResponse>(
  "BearerTokenResponse",
)({
  token: Schema.String,
  expires_at: Schema.Number,
}) {}

export class TokenCacheSchema extends Schema.Class<TokenCacheSchema>(
  "TokenCacheSchema",
)({
  oauth_token: Schema.optional(Schema.String),
  bearer_token: Schema.optional(Schema.String),
  expires_at: Schema.optional(Schema.Number),
}) {}

export class ModelLimits extends Schema.Class<ModelLimits>("ModelLimits")({
  max_prompt_tokens: Schema.optional(Schema.Number),
  max_output_tokens: Schema.optional(Schema.Number),
}) {}

export class ModelSupports extends Schema.Class<ModelSupports>("ModelSupports")({
  streaming: Schema.optional(Schema.Boolean),
  tool_calls: Schema.optional(Schema.Boolean),
}) {}

export class ModelCapabilities extends Schema.Class<ModelCapabilities>(
  "ModelCapabilities",
)({
  type: Schema.optional(Schema.String),
  tokenizer: Schema.optional(Schema.String),
  limits: Schema.optional(ModelLimits),
  supports: Schema.optional(ModelSupports),
}) {}

export class ModelEntry extends Schema.Class<ModelEntry>("ModelEntry")({
  id: Schema.String,
  name: Schema.String,
  model_picker_enabled: Schema.optional(Schema.Boolean),
  capabilities: Schema.optional(ModelCapabilities),
  supported_endpoints: Schema.optional(Schema.Array(Schema.String)),
}) {}

export class ModelsResponse extends Schema.Class<ModelsResponse>(
  "ModelsResponse",
)({
  data: Schema.Array(ModelEntry),
}) {}
