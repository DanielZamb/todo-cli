declare const TODO_BUILD_ID: string | undefined;

export const BUILD_ID =
  typeof TODO_BUILD_ID === "undefined" ? "dev" : TODO_BUILD_ID;
