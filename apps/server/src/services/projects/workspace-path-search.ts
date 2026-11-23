import {
  DEFAULT_PATH_LIST_EXCLUDE_NAMES,
  WORKSPACE_PATH_LIST_INCLUDE_HIDDEN,
} from "../../routes/path-list-policy.js";
import type {
  WorkspacePathSearchFolders,
  WorkspaceSearchPathEntry,
  WorkspaceSearchPathListResponse,
} from "@bb/server-contract";
import { COMMAND_TIMEOUT_MS } from "../../constants.js";
import { ApiError } from "../../errors.js";
import type { WorkSessionDeps } from "../../types.js";
import { callHostRetryableOnlineRpc } from "../hosts/online-rpc.js";

export interface SearchWorkspaceFolderPathsArgs {
  extraFolders: readonly string[];
  folders: WorkspacePathSearchFolders | "all";
  hostId: string;
  includeDirectories: boolean;
  includeFiles: boolean;
  limit: number;
  mainPath: string;
  query: string | undefined;
  signal: AbortSignal;
}

function isMissingFolderError(error: unknown): boolean {
  return error instanceof ApiError && error.body.code === "ENOENT";
}

async function listFolderPaths(
  deps: WorkSessionDeps,
  args: SearchWorkspaceFolderPathsArgs,
  folderPath: string,
): Promise<WorkspaceSearchPathListResponse> {
  try {
    const result = await callHostRetryableOnlineRpc(deps, {
      hostId: args.hostId,
      signal: args.signal,
      timeoutMs: COMMAND_TIMEOUT_MS,
      command: {
        type: "host.list_paths",
        path: folderPath,
        ...(args.query ? { query: args.query } : {}),
        limit: args.limit,
        includeFiles: args.includeFiles,
        includeDirectories: args.includeDirectories,
        includeHidden: WORKSPACE_PATH_LIST_INCLUDE_HIDDEN,
        respectGitIgnore: true,
        excludeNames: [...DEFAULT_PATH_LIST_EXCLUDE_NAMES],
      },
    });
    const folder = folderPath === args.mainPath ? null : folderPath;
    return {
      paths: result.paths.map((entry) => ({ ...entry, folderPath: folder })),
      truncated: result.truncated,
    };
  } catch (error) {
    if (isMissingFolderError(error)) return { paths: [], truncated: false };
    throw error;
  }
}

export async function searchWorkspaceFolderPaths(
  deps: WorkSessionDeps,
  args: SearchWorkspaceFolderPathsArgs,
): Promise<WorkspaceSearchPathListResponse> {
  const folderPaths =
    args.folders === "main"
      ? [args.mainPath]
      : args.folders === "extra"
        ? args.extraFolders
        : [args.mainPath, ...args.extraFolders];
  const lists = await Promise.all(
    folderPaths.map((folderPath) => listFolderPaths(deps, args, folderPath)),
  );
  const [main] = lists;
  if (lists.length === 1 && main !== undefined) return main;
  const merged: WorkspaceSearchPathEntry[] = lists
    .flatMap((list) => list.paths)
    .map((entry, order) => ({ entry, order }))
    .sort((left, right) =>
      args.query
        ? right.entry.score - left.entry.score || left.order - right.order
        : left.order - right.order,
    )
    .map(({ entry }) => entry);
  return {
    paths: merged.slice(0, args.limit),
    truncated:
      merged.length > args.limit || lists.some((list) => list.truncated),
  };
}
