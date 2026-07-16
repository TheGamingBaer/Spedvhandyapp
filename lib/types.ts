export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "head" | "options";

export interface ApiParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie" | "body" | "formData";
  required: boolean;
  description?: string;
  schema?: Record<string, unknown>;
  type?: string;
  format?: string;
  example?: unknown;
  default?: unknown;
}

export interface ApiEndpoint {
  id: string;
  method: HttpMethod;
  path: string;
  displayPath: string;
  tag: string;
  summary: string;
  description?: string;
  operationId?: string;
  parameters: ApiParameter[];
  requestBody?: {
    required: boolean;
    contentTypes: string[];
    schema?: Record<string, unknown>;
    example?: unknown;
  };
  produces: string[];
  deprecated: boolean;
  isSafeRead: boolean;
}

export type AuthMode = "header" | "query" | "bearer";

export interface AuthConfig {
  mode: AuthMode;
  name: string;
  prefix?: string;
  source: "openapi" | "detected" | "manual";
}

export interface ApiCallResult {
  ok: boolean;
  upstreamStatus: number;
  statusText: string;
  contentType: string;
  headers: Record<string, string>;
  data: unknown;
  binary?: {
    base64: string;
    filename?: string;
  };
  authUsed?: string;
  elapsedMs: number;
  timestamp: string;
}

export interface HistoryItem {
  id: string;
  endpointId: string;
  method: string;
  path: string;
  summary: string;
  status: number;
  ok: boolean;
  elapsedMs: number;
  timestamp: string;
}

export interface CachedResponse {
  endpointId: string;
  endpoint: Pick<ApiEndpoint, "id" | "method" | "path" | "tag" | "summary">;
  result: ApiCallResult;
}
