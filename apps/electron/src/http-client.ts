import { TodoApi } from "@todo/api";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";

export const taskHttpClient = (
  origin: string,
  credential: () => string | undefined,
) =>
  HttpApiClient.make(TodoApi, {
    baseUrl: origin,
    transformClient: (http) =>
      HttpClient.mapRequest(http, (request) => {
        const current = credential();
        return current
          ? HttpClientRequest.bearerToken(request, current)
          : request;
      }),
  });
