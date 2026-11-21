import axios from "axios";

const configured = (import.meta.env.VITE_API_URL || "/api").trim().replace(/\/+$/, "");
export const apiBase = /\/api$/.test(configured) ? configured : configured + "/api";
export const tokenKey = "docchat.jwt";
export const sessionEvent = "docchat:session";
export const readToken = () => localStorage.getItem(tokenKey);

export function forgetToken(expected, expired = false) {
  // A late response belonging to a previous session cannot log out a new one.
  if (expected && readToken() === expected) {
    localStorage.removeItem(tokenKey);
    window.dispatchEvent(new CustomEvent(sessionEvent, { detail: { expired } }));
  }
}

export const api = axios.create({ baseURL: apiBase, timeout: 30000 });
api.interceptors.request.use((config) => {
  const token = !config.publicRequest && readToken();
  if (token) {
    config.sessionToken = token;
    config.headers.set("Authorization", "Bearer " + token);
  }
  return config;
});
api.interceptors.response.use((response) => response, (error) => {
  if (error.response?.status === 401) forgetToken(error.config?.sessionToken, true);
  return Promise.reject(error);
});

export function errorText(error, fallback = "Something went wrong. Please try again.") {
  const data = error?.response?.data;
  if (typeof data?.error === "string") return data.error;
  if (typeof data?.error?.message === "string") return data.error.message;
  if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") return "The request timed out. Please try again.";
  if (error?.code === "ERR_NETWORK" || error instanceof TypeError) return "Couldn’t reach DocChat. Check your connection and try again.";
  return error instanceof Error && !axios.isAxiosError(error) ? error.message : fallback;
}

export async function openAnswer(chatId, content, signal) {
  const token = readToken();
  const response = await fetch(apiBase + "/conversations/" + encodeURIComponent(chatId) + "/messages", {
    method: "POST", signal, headers: {
      "Content-Type": "application/json", Accept: "text/event-stream", Authorization: "Bearer " + token
    }, body: JSON.stringify({ content })
  });
  if (!response.ok) {
    if (response.status === 401) forgetToken(token, true);
    const data = await response.json().catch(() => null);
    throw new Error(errorText({ response: { data } }, "Couldn’t send your question. Please try again."));
  }
  if (response.headers.get("content-type")?.split(";")[0].trim() !== "text/event-stream" || !response.body) {
    await response.body?.cancel();
    throw new Error("The server returned an unreadable answer. Please try again.");
  }
  return response.body;
}
