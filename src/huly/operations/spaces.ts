/**
 * Generic Huly space, space type, role, and permission operations.
 *
 * This layer intentionally handles discovery and safe metadata/member updates
 * only. Generic creation is limited to metadata-proven core TypedSpace types;
 * module-specific tools remain the entrypoints for richer space classes.
 *
 * @module
 */
export { getSpace, getSpaceType, listSpacePermissions, listSpaces, listSpaceTypes } from "./spaces-read.js"

export { getGlobalSpaceAdmins, setGlobalSpaceAdmins } from "./spaces-admins.js"

export { createSpace } from "./spaces-create.js"

export {
  addSpaceMembers,
  addSpaceRoleMembers,
  removeSpaceMembers,
  removeSpaceRoleMembers,
  setSpaceOwners,
  setSpaceRoleMembers,
  updateSpace
} from "./spaces-write.js"

export { mergeUniqueSortedAccountUuids, removeAccountUuids } from "./spaces-shared.js"
