/**
 * Temporary minimal Drive SDK boundary.
 *
 * `@hcengineering/drive@0.7.423` is present in the resolved Huly dependency
 * graph, but its published tarball has no `.d.ts` declarations and pulls a
 * newer mixed SDK graph when imported directly. Keep this file small,
 * searchable, and limited to constants/types needed by MCP Drive tools.
 *
 * Remove this boundary after issue #90 is resolved and a compatible typed
 * Drive package can be imported normally.
 */
import type { AttachedDoc, Blob, CollectionSize, Doc, Ref, Space, TypedSpace } from "@hcengineering/core"

import { toClassRef, toRef } from "./operations/sdk-boundary.js"

export type Drive = TypedSpace

interface Resource extends Doc<Drive> {
  readonly title: string
  readonly parent: string
  readonly path: ReadonlyArray<string>
  readonly comments?: number
  readonly file?: Ref<FileVersion>
}

export interface Folder extends Doc<Drive> {
  readonly title: string
  readonly parent: Ref<Folder>
  readonly path: ReadonlyArray<Ref<Folder>>
  readonly comments?: number
  readonly file?: never
  readonly version?: never
}

export interface File extends Doc<Drive> {
  readonly title: string
  readonly parent: Ref<Folder>
  readonly path: ReadonlyArray<Ref<Folder>>
  readonly comments?: number
  readonly file: Ref<FileVersion>
  readonly versions: CollectionSize<FileVersion>
  readonly version: number
}

export interface FileVersion extends AttachedDoc<File, "versions", Drive> {
  readonly title: string
  readonly file: Ref<Blob>
  readonly size: number
  readonly type: string
  readonly lastModified: number
  readonly metadata?: Record<string, unknown>
  readonly version: number
}

export const drive = {
  class: {
    Drive: toClassRef<Drive>("drive:class:Drive"),
    File: toClassRef<File>("drive:class:File"),
    FileVersion: toClassRef<FileVersion>("drive:class:FileVersion"),
    Folder: toClassRef<Folder>("drive:class:Folder"),
    Resource: toClassRef<Resource>("drive:class:Resource")
  },
  ids: { Root: toRef<Folder>("drive:ids:Root") },
  permission: {
    CreateFile: "drive:permission:CreateFile",
    UpdateFile: "drive:permission:UpdateFile",
    RemoveFile: "drive:permission:RemoveFile",
    CreateFolder: "drive:permission:CreateFolder",
    UpdateFolder: "drive:permission:UpdateFolder",
    RemoveFolder: "drive:permission:RemoveFolder"
  },
  spaceType: { DefaultDrive: "drive:spaceType:DefaultDrive" }
} as const

export const computeChildPath = (parent: Folder | undefined): ReadonlyArray<Ref<Folder>> =>
  parent === undefined ? [] : [parent._id, ...parent.path]

export type DriveSpace = Space & Drive
