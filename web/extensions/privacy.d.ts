export type Integer = bigint | number | string;
export interface EncryptionIdentity { privateKey: CryptoKey; publicKey: string; }
export interface EncryptedIdentityBackup { schema: 'anima-encrypted-identity/1'; publicKey: string; iterations: 600000; salt: string; iv: string; ciphertext: string; }
export interface UnsignedTransaction { to?: string; data?: string; value?: bigint; }
/** An injected ethers-compatible contract. Nothing in this SDK sends a transaction. */
export interface ContractLike { getAddress(): Promise<string>; [method: string]: unknown; }
export interface PrivacyConfig {
 chainId: Integer; owner: string; tokenId?: Integer;
 keys: ContractLike; memory: ContractLike; chat: ContractLike;
 collection?: ContractLike; portal?: ContractLike; identity?: EncryptionIdentity;
}
export interface GroupMessage { sender: string; epoch: string; sequence: string; text: string; }
export declare function createIdentity(): Promise<EncryptionIdentity>;
export declare function exportIdentity(identity: EncryptionIdentity, passphrase: string): Promise<EncryptedIdentityBackup>;
export declare function importIdentity(backup: EncryptedIdentityBackup, passphrase: string): Promise<EncryptionIdentity>;
export declare class PrivacyClient {
 constructor(config: PrivacyConfig);
 identity: EncryptionIdentity | null;
 revision: number;
 newIdentity(): Promise<string>;
 register(): Promise<UnsignedTransaction>;
 verifyIdentity(): Promise<void>;
 backup(passphrase: string): Promise<EncryptedIdentityBackup>;
 restore(backup: EncryptedIdentityBackup, passphrase: string): Promise<string>;
 publishMemory(tokenId: Integer, text: string): Promise<{ transaction: UnsignedTransaction; commitment: string }>;
 ownMemory(tokenId: Integer): Promise<{ record: unknown; text: string; salt: string }>;
 proposeMemory(tokenId: Integer, recipient: string, deadline: Integer): Promise<{ transaction: UnsignedTransaction; commitment: string }>;
 receiveMemory(offerId: Integer): Promise<{ text: string; tokenId: string; transaction: UnsignedTransaction }>;
 readReceivedMemory(offerId: Integer): Promise<{ text: string; tokenId: string }>;
 approveMemoryTransfer(tokenId: Integer): Promise<UnsignedTransaction>;
 cancelMemory(offerId: Integer): Promise<UnsignedTransaction>;
 createRoom(): Promise<UnsignedTransaction>;
 invite(roomId: Integer, recipient: string, deadline: Integer): Promise<UnsignedTransaction>;
 join(roomId: Integer): Promise<UnsignedTransaction>;
 remove(roomId: Integer, recipient: string): Promise<UnsignedTransaction>;
 leave(roomId: Integer): Promise<UnsignedTransaction>;
 rotate(roomId: Integer, members: string[]): Promise<{ transaction: UnsignedTransaction; epoch: string }>;
 openEpoch(roomId: Integer, epoch?: Integer): Promise<{ epoch: string }>;
 post(roomId: Integer, text: string): Promise<UnsignedTransaction>;
 readMessage(roomId: Integer, index: Integer): Promise<GroupMessage>;
 queuePortal(tokenId: Integer, expires: Integer): Promise<UnsignedTransaction>;
 dispatchPortal(tokenId: Integer, options?: string): Promise<UnsignedTransaction>;
 lock(): void;
}
export interface PublicAction {
 id: string; label: string; contract: string; method: string; description: string; sender: 'wallet';
 fields: { name: string; label: string; type: string; default?: string }[];
}
export declare const ACTIONS: PublicAction[];
