/* eslint-disable no-restricted-syntax, @typescript-eslint/consistent-type-assertions -- SDK phantom fixture types have no runtime constructors */
import { describe, it } from "@effect/vitest"
import { type Doc, type FindOptions, type FindResult, type Ref, SortingOrder } from "@hcengineering/core"
import type { NotificationProvider, NotificationType } from "@hcengineering/notification"
import { Effect } from "effect"
import { expect } from "vitest"

import type { NotificationProviderId, NotificationTypeId } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../../../src/huly/diagnostics.js"
import { HulyConnectionError } from "../../../src/huly/errors.js"
import { notification } from "../../../src/huly/huly-plugins.js"
import {
  requireNotificationProviderId,
  requireNotificationTypeId
} from "../../../src/huly/operations/notification-metadata.js"
import {
  listNotificationProviders,
  listNotificationTypes,
  updateNotificationTypeSetting
} from "../../../src/huly/operations/notification-preferences.js"
import { updateNotificationProviderSetting } from "../../../src/huly/operations/notifications.js"
import { assertAt } from "../../../src/utils/assertions.js"
import { notificationProviderId, notificationTypeId } from "../../helpers/brands.js"

const provider = (id: string, label: string, order = 1): NotificationProvider =>
  ({
    _id: id,
    _class: notification.class.NotificationProvider,
    space: "core:space:Model",
    modifiedOn: 0,
    modifiedBy: "core:account:System",
    label,
    description: `${label} description`,
    icon: "icon",
    defaultEnabled: true,
    canDisable: true,
    order
  }) as NotificationProvider

const notificationType = (id: string, label: string, overrides: Partial<NotificationType> = {}): NotificationType =>
  ({
    _id: id,
    _class: notification.class.NotificationType,
    space: "core:space:Model",
    modifiedOn: 0,
    modifiedBy: "core:account:System",
    label,
    generated: false,
    hidden: false,
    group: "notification:group:Common",
    defaultEnabled: true,
    txClasses: [],
    objectClass: "tracker:class:Issue",
    ...overrides
  }) as unknown as NotificationType

const layerWithMetadata = (config: {
  readonly modelProviders?: ReadonlyArray<unknown>
  readonly remoteProviders?: ReadonlyArray<unknown>
  readonly modelTypes?: ReadonlyArray<unknown>
  readonly remoteTypes?: ReadonlyArray<unknown>
  readonly failModel?: boolean
  readonly failRemote?: boolean
}) => {
  const select = <T extends Doc>(
    classRef: Ref<Doc>,
    providers: ReadonlyArray<unknown>,
    types: ReadonlyArray<unknown>
  ): FindResult<T> => {
    const rows =
      classRef === notification.class.NotificationProvider
        ? providers
        : classRef === notification.class.NotificationType
          ? types
          : []
    // The class ref selects the matching fixture collection at this SDK boundary.

    return [...rows] as unknown as FindResult<T>
  }
  const findAll: HulyClientOperations["findAll"] = (classRef, _query, options) => {
    if (config.failRemote === true) {
      return Effect.fail(new HulyConnectionError({ message: "remote metadata unavailable" }))
    }
    const rows = select(classRef, config.remoteProviders ?? [], config.remoteTypes ?? [])
    const providerOptions: FindOptions<NotificationProvider> | undefined =
      classRef === notification.class.NotificationProvider
        ? (options as FindOptions<NotificationProvider> | undefined)
        : undefined
    const sorted =
      providerOptions?.sort?.order === SortingOrder.Ascending
        ? [...(rows as unknown as FindResult<NotificationProvider>)].sort((left, right) => left.order - right.order)
        : [...rows]
    return Effect.succeed(sorted.slice(0, options?.limit) as FindResult<never>)
  }
  const findAllInModel: HulyClientOperations["findAllInModel"] = (classRef) =>
    config.failModel === true
      ? Effect.fail(new HulyConnectionError({ message: "local model unavailable" }))
      : Effect.succeed(select(classRef, config.modelProviders ?? [], config.modelTypes ?? []))
  return HulyClient.testLayer({ findAll, findAllInModel })
}

describe("notification model metadata", () => {
  it.effect("uses authoritative model provider definitions without warnings", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const result = yield* listNotificationProviders({}).pipe(
        Effect.provide(
          layerWithMetadata({
            modelProviders: [
              provider("provider:model-later", "Model push", 2),
              provider("provider:model", "Model inbox")
            ],
            remoteProviders: [provider("provider:remote", "Remote inbox")]
          })
        ),
        Effect.provideService(Diagnostics, diagnostics.service)
      )

      expect(result.map((item) => item.id)).toEqual(["provider:model", "provider:model-later"])
      expect(yield* diagnostics.drainWarnings).toEqual([])
    })
  )

  it.effect("uses remote provider definitions with an actionable warning when model metadata is unavailable", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const result = yield* listNotificationProviders({}).pipe(
        Effect.provide(
          layerWithMetadata({ failModel: true, remoteProviders: [provider("provider:remote", "Remote inbox")] })
        ),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const warnings = yield* diagnostics.drainWarnings

      expect(result.map((item) => item.id)).toEqual(["provider:remote"])
      expect(warnings).toHaveLength(1)
      expect(assertAt(warnings, 0).code).toBe("notification_metadata_degraded")
      expect(assertAt(warnings, 0).message).toContain("server compatibility fallback")
    })
  )

  it.effect("sorts remote providers before applying the requested limit", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const result = yield* listNotificationProviders({ limit: 2 }).pipe(
        Effect.provide(
          layerWithMetadata({
            failModel: true,
            remoteProviders: [
              provider("provider:last", "Last", 30),
              provider("provider:first", "First", 10),
              provider("provider:middle", "Middle", 20)
            ]
          })
        ),
        Effect.provideService(Diagnostics, diagnostics.service)
      )

      expect(result.map((item) => item.id)).toEqual(["provider:first", "provider:middle"])
    })
  )

  it.effect("uses authoritative model notification types without warnings", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const result = yield* listNotificationTypes({}).pipe(
        Effect.provide(
          layerWithMetadata({
            modelTypes: [notificationType("type:model", "Issue updated")],
            remoteTypes: [notificationType("type:remote", "Remote issue updated")]
          })
        ),
        Effect.provideService(Diagnostics, diagnostics.service)
      )

      expect(result.map((item) => item.id)).toEqual(["type:model"])
      expect(yield* diagnostics.drainWarnings).toEqual([])
    })
  )

  it.effect("rejects provider IDs absent from authoritative model definitions", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const error = yield* Effect.flip(
        updateNotificationProviderSetting({
          providerId: notificationProviderId("provider:missing"),
          enabled: true
        }).pipe(
          Effect.provide(layerWithMetadata({ modelProviders: [provider("provider:known", "Known provider")] })),
          Effect.provideService(Diagnostics, diagnostics.service)
        )
      )

      expect(error._tag).toBe("NotificationProviderNotFoundError")
      expect(error.message).toContain("provider:missing")
      expect(yield* diagnostics.drainWarnings).toEqual([])
    })
  )

  it.effect("validates an exact provider ID outside the 200-item list window", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const modelProviders = Array.from({ length: 201 }, (_, index) =>
        provider(`provider:${index}`, `Provider ${index}`, index)
      )
      const result = yield* updateNotificationProviderSetting({
        providerId: notificationProviderId("provider:200"),
        enabled: true
      }).pipe(
        Effect.provide(layerWithMetadata({ modelProviders })),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const validatedId: NotificationProviderId = yield* Effect.gen(function* () {
        const client = yield* HulyClient
        return yield* requireNotificationProviderId(client, notificationProviderId("provider:200"))
      }).pipe(
        Effect.provide(layerWithMetadata({ modelProviders })),
        Effect.provideService(Diagnostics, diagnostics.service)
      )

      expect(result.providerId).toBe("provider:200")
      expect(validatedId).toBe("provider:200")
      expect(yield* diagnostics.drainWarnings).toEqual([])
    })
  )

  it.effect("rejects type IDs absent from authoritative model definitions", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const error = yield* Effect.flip(
        updateNotificationTypeSetting({
          providerId: notificationProviderId("provider:known"),
          typeId: notificationTypeId("type:missing"),
          enabled: true
        }).pipe(
          Effect.provide(
            layerWithMetadata({
              modelProviders: [provider("provider:known", "Known provider")],
              modelTypes: [notificationType("type:known", "Known type")]
            })
          ),
          Effect.provideService(Diagnostics, diagnostics.service)
        )
      )

      expect(error._tag).toBe("NotificationTypeNotFoundError")
      expect(yield* diagnostics.drainWarnings).toEqual([])
    })
  )

  it.effect("validates an exact type ID outside the 200-item list window", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const modelTypes = Array.from({ length: 201 }, (_, index) => notificationType(`type:${index}`, `Type ${index}`))
      const error = yield* Effect.flip(
        updateNotificationTypeSetting({
          providerId: notificationProviderId("provider:known"),
          typeId: notificationTypeId("type:200"),
          enabled: true
        }).pipe(
          Effect.provide(
            layerWithMetadata({ modelProviders: [provider("provider:known", "Known provider")], modelTypes })
          ),
          Effect.provideService(Diagnostics, diagnostics.service)
        )
      )
      const validatedId: NotificationTypeId = yield* Effect.gen(function* () {
        const client = yield* HulyClient
        return yield* requireNotificationTypeId(client, notificationTypeId("type:200"))
      }).pipe(
        Effect.provide(layerWithMetadata({ modelTypes })),
        Effect.provideService(Diagnostics, diagnostics.service)
      )

      expect(error._tag).toBe("NotificationProviderNotConfigurableError")
      expect(validatedId).toBe("type:200")
      expect(yield* diagnostics.drainWarnings).toEqual([])
    })
  )

  it.effect("keeps compatible REST provider updates usable and warns when caller IDs must be trusted", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const result = yield* updateNotificationProviderSetting({
        providerId: notificationProviderId("provider:legacy"),
        enabled: true
      }).pipe(Effect.provide(layerWithMetadata({})), Effect.provideService(Diagnostics, diagnostics.service))
      const warnings = yield* diagnostics.drainWarnings

      expect(result).toEqual({ providerId: "provider:legacy", enabled: true, updated: false })
      expect(warnings.map((warning) => warning.code)).toEqual([
        "notification_metadata_degraded",
        "notification_metadata_degraded"
      ])
      expect(assertAt(warnings, 1).message).toContain("trusted caller-supplied provider ID")
    })
  )

  it.effect("accepts an exact provider ID returned by the REST compatibility lookup", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const result = yield* updateNotificationProviderSetting({
        providerId: notificationProviderId("provider:remote"),
        enabled: true
      }).pipe(
        Effect.provide(
          layerWithMetadata({ failModel: true, remoteProviders: [provider("provider:remote", "Remote provider")] })
        ),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const warnings = yield* diagnostics.drainWarnings

      expect(result.providerId).toBe("provider:remote")
      expect(warnings).toHaveLength(1)
      expect(assertAt(warnings, 0).message).toContain("server compatibility fallback")
    })
  )

  it.effect("projects provider presentation fields once for summaries and omission warnings", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const partialProvider = {
        ...provider("provider:partial", "Partial"),
        label: { key: "provider.label" },
        description: undefined,
        depends: "provider:base"
      }
      const result = yield* listNotificationProviders({}).pipe(
        Effect.provide(
          layerWithMetadata({
            modelProviders: [partialProvider, provider("provider:fractional-order", "Fractional order", 1.5)]
          })
        ),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const warnings = yield* diagnostics.drainWarnings

      expect(result).toEqual([
        { id: "provider:partial", defaultEnabled: true, canDisable: true, order: 1, depends: "provider:base" }
      ])
      expect(warnings).toHaveLength(2)
      expect(assertAt(warnings, 0).message).toContain("failed Effect Schema parsing")
      expect(assertAt(warnings, 1).message).toContain("2 notification-provider label or description")
    })
  )

  it.effect("projects type presentation fields once for summaries and omission warnings", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const result = yield* listNotificationTypes({ includeHidden: true }).pipe(
        Effect.provide(
          layerWithMetadata({
            modelTypes: [{ ...notificationType("type:partial", "Partial"), label: { key: "type.label" } }]
          })
        ),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const warnings = yield* diagnostics.drainWarnings

      expect(result).toEqual([
        {
          id: "type:partial",
          generated: false,
          hidden: false,
          defaultEnabled: true,
          group: "notification:group:Common",
          objectClass: "tracker:class:Issue"
        }
      ])
      expect(warnings).toHaveLength(1)
      expect(assertAt(warnings, 0).message).toContain("1 notification-type label")
    })
  )

  it.effect("projects all optional authoritative notification type metadata", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const result = yield* listNotificationTypes({ includeHidden: true }).pipe(
        Effect.provide(
          layerWithMetadata({
            modelTypes: [
              notificationType("type:detailed", "Detailed", {
                group: "notification:group:Detailed" as never,
                onlyOwn: true,
                attachedToClass: "tracker:class:Project" as never,
                field: "assignee",
                spaceSubscribe: true,
                allowedForAuthor: true
              })
            ]
          })
        ),
        Effect.provideService(Diagnostics, diagnostics.service)
      )

      expect(assertAt(result, 0)).toMatchObject({
        group: "notification:group:Detailed",
        onlyOwn: true,
        attachedToClass: "tracker:class:Project",
        field: "assignee",
        spaceSubscribe: true,
        allowedForAuthor: true
      })
      expect(yield* diagnostics.drainWarnings).toEqual([])
    })
  )

  it.effect("warns when compatible REST type updates must trust both caller identifiers", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const error = yield* Effect.flip(
        updateNotificationTypeSetting({
          providerId: notificationProviderId("provider:legacy"),
          typeId: notificationTypeId("type:legacy"),
          enabled: true
        }).pipe(Effect.provide(layerWithMetadata({})), Effect.provideService(Diagnostics, diagnostics.service))
      )
      const warnings = yield* diagnostics.drainWarnings

      expect(error._tag).toBe("NotificationProviderNotConfigurableError")
      expect(warnings.some((warning) => warning.message.includes("trusted caller-supplied type ID"))).toBe(true)
    })
  )

  it.effect("reports malformed rows returned by the REST compatibility fallback", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const result = yield* listNotificationTypes({}).pipe(
        Effect.provide(
          layerWithMetadata({ remoteTypes: [notificationType("type:remote", "Remote"), { _id: "type:malformed" }] })
        ),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const warnings = yield* diagnostics.drainWarnings

      expect(result.map((type) => type.id)).toEqual(["type:remote"])
      expect(assertAt(warnings, 0).message).toContain("1 malformed definition row")
    })
  )

  it.effect("propagates a typed connection error when model and remote metadata lookups fail", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const error = yield* Effect.flip(
        listNotificationProviders({}).pipe(
          Effect.provide(layerWithMetadata({ failModel: true, failRemote: true })),
          Effect.provideService(Diagnostics, diagnostics.service)
        )
      )

      expect(error._tag).toBe("HulyConnectionError")
      expect(error.message).toContain("remote metadata unavailable")
      expect(yield* diagnostics.drainWarnings).toEqual([])
    })
  )

  it.effect("warns when invalid model rows force partial REST presentation metadata", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const result = yield* listNotificationProviders({}).pipe(
        Effect.provide(
          layerWithMetadata({
            modelProviders: [{ _id: "provider:invalid" }],
            remoteProviders: [
              {
                ...provider("provider:remote-partial", "Remote partial"),
                label: { key: "remote.label" },
                description: undefined
              }
            ]
          })
        ),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const warnings = yield* diagnostics.drainWarnings

      expect(result).toEqual([{ id: "provider:remote-partial", defaultEnabled: true, canDisable: true, order: 1 }])
      expect(assertAt(warnings, 0).message).toContain("metadata was invalid")
      expect(assertAt(warnings, 1).message).toContain("server compatibility data is partial")
    })
  )

  it.effect("omits an absent notification type group without degrading other authoritative fields", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeDiagnosticsScope
      const noGroup = {
        _id: "type:no-group",
        label: "No group",
        generated: false,
        hidden: false,
        defaultEnabled: true,
        objectClass: "tracker:class:Issue"
      }
      const result = yield* listNotificationTypes({}).pipe(
        Effect.provide(layerWithMetadata({ modelTypes: [noGroup] })),
        Effect.provideService(Diagnostics, diagnostics.service)
      )

      expect(assertAt(result, 0).group).toBeUndefined()
      expect(yield* diagnostics.drainWarnings).toEqual([])
    })
  )
})
