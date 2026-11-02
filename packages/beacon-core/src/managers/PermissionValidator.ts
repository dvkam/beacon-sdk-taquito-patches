import {
  BeaconMessage,
  BeaconMessageType,
  PermissionScope,
  StoredAccountInfo
} from '@ecadlabs/beacon-types'
import { getAccountIdentifier } from '../utils/get-account-identifier'

/**
 * @internalapi
 *
 * The PermissionValidator is used to check if permissions for a certain message type have been given
 */
type PermissionCheck = Pick<StoredAccountInfo, 'address' | 'scopes'>

export class PermissionValidator {
  /**
   * Check if permissions were given for a certain message type.
   *
   * PermissionRequest and BroadcastRequest will always return true.
   *
   * @param message Beacon Message
   */
  public static async hasPermission(
    message: BeaconMessage,
    getOne: (id: string) => Promise<PermissionCheck | undefined>,
    getAll: () => Promise<PermissionCheck[]>
  ): Promise<boolean> {
    switch (message.type) {
      case BeaconMessageType.PermissionRequest:
      case BeaconMessageType.BroadcastRequest: {
        return true
      }
      case BeaconMessageType.OperationRequest: {
        const accountIdentifier: string = await getAccountIdentifier(
          message.sourceAddress,
          message.network
        )

        const permission: PermissionCheck | undefined = await getOne(accountIdentifier)
        if (!permission) {
          return false
        }

        return permission.scopes.includes(PermissionScope.OPERATION_REQUEST)
      }
      case BeaconMessageType.SignPayloadRequest: {
        const permissions: PermissionCheck[] = await getAll()
        const filteredPermissions: PermissionCheck[] = permissions.filter(
          (permission: PermissionCheck) => permission.address === message.sourceAddress
        )

        if (filteredPermissions.length === 0) {
          return false
        }

        return filteredPermissions.some((permission: PermissionCheck) =>
          permission.scopes.includes(PermissionScope.SIGN)
        )
      }
      default:
        throw new Error('Message not handled')
    }
  }
}
