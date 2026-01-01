import { AddressUtils } from './address.js';
import { EthAddressUtils } from './eth-address.js';
import { FieldUtils } from './field.js';
import { HashUtils } from './hash.js';
import { SelectorUtils } from './selector.js';
import { AbiUtils } from './abi.js';
import { ContractUtils } from './contract.js';
import { StorageUtils } from './storage.js';
import { ArtifactUtils } from './artifact.js';
import { NoteUtils } from './note.js';
import { DeploymentUtils } from './deployment.js';
import { LogUtils } from './log.js';

/**
 * AztecUtilities - Main utility class that groups all utility functions
 * This class provides a unified interface to all Aztec utility functions
 */
export class AztecUtilities {
  // Address utilities
  static addressZero = AddressUtils.addressZero;
  static addressValidate = AddressUtils.addressValidate;
  static addressRandom = AddressUtils.addressRandom;
  static addressIsValid = AddressUtils.addressIsValid;
  static addressToPoint = AddressUtils.addressToPoint;
  static addressFromField = AddressUtils.addressFromField;
  static addressFromBigInt = AddressUtils.addressFromBigInt;
  static addressFromNumber = AddressUtils.addressFromNumber;

  // EthAddress utilities
  static ethAddressZero = EthAddressUtils.ethAddressZero;
  static ethAddressRandom = EthAddressUtils.ethAddressRandom;
  static ethAddressValidate = EthAddressUtils.ethAddressValidate;
  static ethAddressFromField = EthAddressUtils.ethAddressFromField;
  static ethAddressToField = EthAddressUtils.ethAddressToField;
  static ethAddressIsZero = EthAddressUtils.ethAddressIsZero;

  // Field utilities
  static fieldFromString = FieldUtils.fieldFromString;
  static fieldToString = FieldUtils.fieldToString;
  static fieldRandom = FieldUtils.fieldRandom;
  static fieldFromBuffer = FieldUtils.fieldFromBuffer;
  static fieldToBuffer = FieldUtils.fieldToBuffer;
  static fieldFromBigInt = FieldUtils.fieldFromBigInt;
  static fieldToBigInt = FieldUtils.fieldToBigInt;
  static fieldIsZero = FieldUtils.fieldIsZero;
  static fieldEquals = FieldUtils.fieldEquals;

  // Hash utilities
  static keccak = HashUtils.keccak;
  static sha256 = HashUtils.sha256;
  static poseidon2 = HashUtils.poseidon2;
  static computePedersenHash = HashUtils.computePedersenHash;
  static secretHash = HashUtils.secretHash;
  static siloNullifier = HashUtils.siloNullifier;
  static publicDataSlot = HashUtils.publicDataSlot;
  static hashVK = HashUtils.hashVK;
  static noteHashNonce = HashUtils.noteHashNonce;
  static siloNoteHash = HashUtils.siloNoteHash;
  static uniqueNoteHash = HashUtils.uniqueNoteHash;
  static siloPrivateLog = HashUtils.siloPrivateLog;
  static varArgsHash = HashUtils.varArgsHash;
  static calldataHash = HashUtils.calldataHash;
  static l1ToL2MessageNullifier = HashUtils.l1ToL2MessageNullifier;
  static l2ToL1MessageHash = HashUtils.l2ToL1MessageHash;

  // Selector utilities
  static selectorFromSignature = SelectorUtils.selectorFromSignature;
  static selectorFromNameParams = SelectorUtils.selectorFromNameParams;
  static selectorFromField = SelectorUtils.selectorFromField;
  static selectorFromString = SelectorUtils.selectorFromString;
  static selectorEmpty = SelectorUtils.selectorEmpty;
  static eventSelector = SelectorUtils.eventSelector;
  static noteSelector = SelectorUtils.noteSelector;

  // ABI utilities
  static abiEncode = AbiUtils.abiEncode;
  static abiDecode = AbiUtils.abiDecode;
  static decodeFunctionSignature = AbiUtils.decodeFunctionSignature;
  static bufferAsFields = AbiUtils.bufferAsFields;
  static isAddressStruct = AbiUtils.isAddressStruct;
  static isEthAddressStruct = AbiUtils.isEthAddressStruct;
  static isAztecAddressStruct = AbiUtils.isAztecAddressStruct;
  static isFunctionSelectorStruct = AbiUtils.isFunctionSelectorStruct;
  static isWrappedFieldStruct = AbiUtils.isWrappedFieldStruct;
  static isBoundedVecStruct = AbiUtils.isBoundedVecStruct;
  static loadContractArtifact = AbiUtils.loadContractArtifact;
  static loadContractArtifactForPublic = AbiUtils.loadContractArtifactForPublic;
  static contractArtifactToBuffer = AbiUtils.contractArtifactToBuffer;
  static contractArtifactFromBuffer = AbiUtils.contractArtifactFromBuffer;

  // Contract utilities
  static artifactHash = ContractUtils.artifactHash;
  static artifactHashPreimage = ContractUtils.artifactHashPreimage;
  static artifactMetadataHash = ContractUtils.artifactMetadataHash;
  static functionArtifactHash = ContractUtils.functionArtifactHash;
  static functionMetadataHash = ContractUtils.functionMetadataHash;
  static computeContractAddress = ContractUtils.computeContractAddress;
  static computePartialAddress = ContractUtils.computePartialAddress;
  static computePreaddress = ContractUtils.computePreaddress;
  static computeAddressFromKeys = ContractUtils.computeAddressFromKeys;
  static computeSaltedInitializationHash = ContractUtils.computeSaltedInitializationHash;
  static computeInitializationHash = ContractUtils.computeInitializationHash;

  // Storage utilities
  static deriveNoteSlot = StorageUtils.deriveNoteSlot;
  static getStorageLayout = StorageUtils.getStorageLayout;

  // Artifact utilities
  static listArtifacts = ArtifactUtils.listArtifacts;
  static resolveArtifact = ArtifactUtils.resolveArtifact;

  // Note utilities
  static fetchNotes = NoteUtils.fetchNotes;
  static computeNoteHash = NoteUtils.computeNoteHash;
  static computeNoteHashFromContent = NoteUtils.computeNoteHashFromContent;
  static verifyNoteInTransaction = NoteUtils.verifyNoteInTransaction;

  // Deployment utilities
  static deployContract = DeploymentUtils.deployContract;

  // Log utilities
  static decryptRawPrivateLog = LogUtils.decryptRawPrivateLog;
}

