import { env } from "@my-better-t-app/env/web";

type ApiMethod = "GET" | "POST" | "PATCH";

type ApiRequestOptions = {
  method?: ApiMethod;
  userId?: string;
  body?: unknown | FormData;
};

async function request<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  const method = options?.method ?? "GET";
  const isFormData = typeof FormData !== "undefined" && options?.body instanceof FormData;
  const requestInit: RequestInit = {
    method,
    credentials: "include",
    headers: {
      ...(options?.userId ? { "x-user-id": options.userId } : {}),
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
    },
  };
  if (options?.body !== undefined) {
    requestInit.body = isFormData
      ? (options.body as FormData)
      : JSON.stringify(options.body);
  }

  const response = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/api/mvp${path}`, requestInit);

  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed with ${response.status}`);
  }

  return data as T;
}

export const mvpApi = {
  get: <T>(path: string, userId?: string) => request<T>(path, { method: "GET", userId }),
  post: <T>(path: string, userId: string, body?: unknown) =>
    request<T>(path, { method: "POST", userId, body }),
  postForm: <T>(path: string, userId: string, formData: FormData) =>
    request<T>(path, { method: "POST", userId, body: formData }),
  patch: <T>(path: string, userId: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", userId, body }),
};
