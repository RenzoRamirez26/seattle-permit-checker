/**
 * The one way the browser talks to anything: a typed fetch to the FastAPI backend (api/), and nowhere else.
 * In:  a route and its body, typed from src/api/schema.d.ts.  Out: the API's JSON, or an ApiProblem.
 * No key lives here. The backend holds the key and makes every model call.
 */
import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];
export type Meta = Schemas["Meta"];
export type Facts = Schemas["Facts"];
export type Intake = Schemas["Intake"];
export type Check = Schemas["Check"];
export type Result = Schemas["Result"];
export type Finding = Schemas["Finding"];
export type Permit = Schemas["Permit"];
export type PlanReading = Schemas["PlanReading"];
export type ZoningResponse = Schemas["ZoningResponse"];
export type Answer = Schemas["Answer"];

/** The API's address. Set NEXT_PUBLIC_API_BASE at build time; on your own computer it is uvicorn's default. */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000").replace(/\/+$/, "");

export const api = createClient<paths>({ baseUrl: API_BASE });

/** An error the owner can be told about: the API's code (or "network" when the API did not answer). */
export class ApiProblem extends Error {
  constructor(public code: string, public status: number, message: string, public fields?: { field: string; problem: string }[]) {
    super(message);
  }
}

type Envelope = { error?: { code?: string; message?: string; fields?: { field: string; problem: string }[] } };

/** Turns an openapi-fetch reply into its data, or throws an ApiProblem with the API's error code. */
export function unwrap<T>(reply: { data?: T; error?: unknown; response: Response }): T {
  if (reply.data !== undefined && reply.response.ok) return reply.data;
  const e = (reply.error as Envelope | undefined)?.error;
  throw new ApiProblem(e?.code ?? "server_error", reply.response.status, e?.message ?? "", e?.fields);
}

/** Runs a request; a fetch that never reached the API becomes the "network" problem. */
export async function call<T>(request: () => Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let reply;
  try {
    reply = await request();
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiProblem("network", 0, "");
  }
  return unwrap(reply);
}

export const reportUrl = (id: string) => `${API_BASE}/api/checks/${encodeURIComponent(id)}/report.pdf`;
export const sheetUrl = (id: string) => `${API_BASE}/api/checks/${encodeURIComponent(id)}/preparation-sheet.pdf`;
