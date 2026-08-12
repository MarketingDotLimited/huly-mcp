import { Effect } from "effect"

import type {
  GetGlobalSpaceAdminsParams,
  GetGlobalSpaceAdminsResult,
  SetGlobalSpaceAdminsParams,
  SetGlobalSpaceAdminsResult
} from "../../domain/schemas/spaces-administration.js"
import { RoleId, SpaceIdentifier } from "../../domain/schemas/shared.js"
import { SpaceRoleIdentifier } from "../../domain/schemas/spaces.js"
import type { HulyClient } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import { core } from "../huly-plugins.js"
import { getSpace } from "./spaces-read.js"
import { setSpaceRoleMembers } from "./spaces-write.js"

const globalSpace = SpaceIdentifier.make(core.space.Space)
const globalAdminRole = SpaceRoleIdentifier.make(core.role.Admin)
const globalAdminRoleId = RoleId.make(core.role.Admin)

export const getGlobalSpaceAdmins = (
  _params: GetGlobalSpaceAdminsParams
): Effect.Effect<GetGlobalSpaceAdminsResult, Effect.Error<ReturnType<typeof getSpace>>, HulyClient | Diagnostics> =>
  Effect.map(getSpace({ space: globalSpace, includeArchived: true }), (space) => ({
    admins: space.roleAssignments?.find((assignment) => assignment.roleId === globalAdminRoleId)?.members ?? []
  }))

export const setGlobalSpaceAdmins = (
  params: SetGlobalSpaceAdminsParams
): Effect.Effect<SetGlobalSpaceAdminsResult, Effect.Error<ReturnType<typeof setSpaceRoleMembers>>, HulyClient> =>
  Effect.map(setSpaceRoleMembers({ space: globalSpace, role: globalAdminRole, members: params.admins }), (result) => ({
    admins: result.members,
    changed: result.changed
  }))
