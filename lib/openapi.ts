import type { ApiEndpoint, ApiParameter, AuthConfig, HttpMethod } from "@/lib/types";

const METHODS: HttpMethod[] = ["get", "post", "put", "patch", "delete", "head", "options"];

type AnyRecord = Record<string, any>;

export function parseOpenApi(spec: AnyRecord): {
  endpoints: ApiEndpoint[];
  authCandidates: AuthConfig[];
  title: string;
  version: string;
} {
  const endpoints: ApiEndpoint[] = [];
  const basePath = typeof spec.basePath === "string" ? spec.basePath.replace(/\/$/, "") : "";
  const paths = spec.paths && typeof spec.paths === "object" ? spec.paths : {};

  for (const [rawPath, pathItemValue] of Object.entries(paths)) {
    const pathItem = pathItemValue as AnyRecord;
    const inheritedParams = normalizeParameters(pathItem.parameters ?? [], spec);

    for (const method of METHODS) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== "object") continue;

      const parameters = [...inheritedParams, ...normalizeParameters(operation.parameters ?? [], spec)];
      const tag = operation.tags?.[0] || inferTag(rawPath);
      const fullPath = `${basePath}${rawPath}`.replace(/\/+/g, "/");
      const requestBody = normalizeRequestBody(operation.requestBody, spec);
      const consumes = operation.consumes || spec.consumes || [];

      if (!requestBody && consumes.length) {
        const bodyParam = parameters.find((param) => param.in === "body");
        const formParams = parameters.filter((param) => param.in === "formData");
        if (bodyParam || formParams.length) {
          const contentTypes = consumes.length ? consumes : formParams.length ? ["multipart/form-data"] : ["application/json"];
          const schema = bodyParam?.schema ?? (formParams.length ? {
            type: "object",
            properties: Object.fromEntries(formParams.map((param) => [param.name, param.schema ?? { type: param.type || "string", format: param.format }]))
          } : undefined);
          Object.assign(operation, {
            __normalizedRequestBody: {
              required: Boolean(bodyParam?.required || formParams.some((param) => param.required)),
              contentTypes,
              schema,
              example: bodyParam?.example,
            }
          });
        }
      }

      const normalizedRequestBody = requestBody ?? operation.__normalizedRequestBody;
      const summary = operation.summary || operation.operationId || humanizePath(rawPath);
      const id = `${method}:${fullPath}`;

      endpoints.push({
        id,
        method,
        path: fullPath,
        displayPath: rawPath,
        tag,
        summary,
        description: operation.description,
        operationId: operation.operationId,
        parameters,
        requestBody: normalizedRequestBody,
        produces: operation.produces || spec.produces || Object.keys(operation.responses?.["200"]?.content || {}),
        deprecated: Boolean(operation.deprecated),
        isSafeRead: method === "get" || method === "head" || method === "options",
      });
    }
  }

  return {
    endpoints: endpoints.sort((a, b) => a.tag.localeCompare(b.tag) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method)),
    authCandidates: extractAuthCandidates(spec),
    title: spec.info?.title || "SPEDV API",
    version: spec.info?.version || spec.openapi || spec.swagger || "",
  };
}

function normalizeParameters(parameters: AnyRecord[], spec: AnyRecord): ApiParameter[] {
  return parameters.map((parameter) => {
    const resolved = resolveRef(parameter, spec);
    const schema = resolved.schema ? resolveRef(resolved.schema, spec) : undefined;
    return {
      name: resolved.name || "parameter",
      in: resolved.in || "query",
      required: Boolean(resolved.required || resolved.in === "path"),
      description: resolved.description,
      schema,
      type: resolved.type || schema?.type,
      format: resolved.format || schema?.format,
      example: resolved.example ?? schema?.example,
      default: resolved.default ?? schema?.default,
    };
  });
}

function normalizeRequestBody(requestBody: AnyRecord | undefined, spec: AnyRecord) {
  if (!requestBody) return undefined;
  const resolved = resolveRef(requestBody, spec);
  const content = resolved.content || {};
  const contentTypes = Object.keys(content);
  const first = content[contentTypes[0]] || {};
  return {
    required: Boolean(resolved.required),
    contentTypes,
    schema: first.schema ? resolveRef(first.schema, spec) : undefined,
    example: first.example,
  };
}

function extractAuthCandidates(spec: AnyRecord): AuthConfig[] {
  const schemes = spec.components?.securitySchemes || spec.securityDefinitions || {};
  const candidates: AuthConfig[] = [];

  for (const schemeValue of Object.values(schemes)) {
    const scheme = schemeValue as AnyRecord;
    if (scheme.type === "apiKey") {
      candidates.push({
        mode: scheme.in === "query" ? "query" : "header",
        name: scheme.name || "X-API-Key",
        source: "openapi",
      });
    }
    if (scheme.type === "http" && String(scheme.scheme).toLowerCase() === "bearer") {
      candidates.push({ mode: "bearer", name: "Authorization", prefix: "Bearer", source: "openapi" });
    }
    if (scheme.type === "oauth2" || scheme.type === "openIdConnect") {
      candidates.push({ mode: "bearer", name: "Authorization", prefix: "Bearer", source: "openapi" });
    }
  }

  // SPEDV has historically used client-key naming in addition to the more
  // common API-key and bearer conventions. Keep the exact OpenAPI scheme first,
  // then test the documented/legacy spellings without altering the supplied key.
  const fallbacks: AuthConfig[] = [
    { mode: "header", name: "ClientKey", source: "detected" },
    { mode: "header", name: "clientKey", source: "detected" },
    { mode: "header", name: "Client-Key", source: "detected" },
    { mode: "header", name: "X-Client-Key", source: "detected" },
    { mode: "header", name: "client-key", source: "detected" },
    { mode: "header", name: "X-API-Key", source: "detected" },
    { mode: "header", name: "api-key", source: "detected" },
    { mode: "header", name: "ApiKey", source: "detected" },
    { mode: "header", name: "API-Key", source: "detected" },
    { mode: "bearer", name: "Authorization", prefix: "Bearer", source: "detected" },
    { mode: "header", name: "Authorization", prefix: "ApiKey", source: "detected" },
    { mode: "header", name: "Authorization", prefix: "ClientKey", source: "detected" },
    { mode: "header", name: "Authorization", source: "detected" },
    { mode: "query", name: "clientKey", source: "detected" },
    { mode: "query", name: "client_key", source: "detected" },
    { mode: "query", name: "api_key", source: "detected" },
    { mode: "query", name: "apiKey", source: "detected" },
  ];

  const merged = [...candidates, ...fallbacks];
  return merged.filter((candidate, index) => merged.findIndex((other) => `${other.mode}:${other.name}:${other.prefix || ""}` === `${candidate.mode}:${candidate.name}:${candidate.prefix || ""}`) === index);
}

function resolveRef(value: AnyRecord, spec: AnyRecord): AnyRecord {
  if (!value || typeof value !== "object" || !value.$ref) return value;
  const parts = String(value.$ref).replace(/^#\//, "").split("/");
  let current: any = spec;
  for (const part of parts) current = current?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
  return current || value;
}

function inferTag(path: string) {
  const segment = path.split("/").filter(Boolean).find((part) => !part.startsWith("{"));
  return segment ? titleCase(segment) : "Allgemein";
}

function humanizePath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/[{}]/g, ""))
    .map(titleCase)
    .join(" · ") || "API-Aufruf";
}

export function titleCase(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function createExample(schema: AnyRecord | undefined, depth = 0): unknown {
  if (!schema || depth > 5) return undefined;
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.oneOf?.length) return createExample(schema.oneOf[0], depth + 1);
  if (schema.anyOf?.length) return createExample(schema.anyOf[0], depth + 1);
  if (schema.type === "array") return [createExample(schema.items, depth + 1)].filter((value) => value !== undefined);
  if (schema.type === "object" || schema.properties) {
    return Object.fromEntries(Object.entries(schema.properties || {}).map(([key, child]) => [key, createExample(child as AnyRecord, depth + 1)]));
  }
  if (schema.type === "boolean") return false;
  if (schema.type === "integer" || schema.type === "number") return 0;
  if (schema.format === "date") return new Date().toISOString().slice(0, 10);
  if (schema.format === "date-time") return new Date().toISOString();
  if (schema.format === "uuid") return "00000000-0000-0000-0000-000000000000";
  return "";
}

export function hasRequiredPathParameters(endpoint: ApiEndpoint) {
  return endpoint.parameters.some((parameter) => parameter.in === "path" && parameter.required);
}
