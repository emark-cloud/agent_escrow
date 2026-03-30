// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IGenLayerBridgeReceiver} from "./interfaces/IGenLayerBridgeReceiver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VerdictRegistry
 * @notice Receives AI jury verdicts bridged from GenLayer via relay service.
 *         Stores verdicts on Base Sepolia for cross-chain verification.
 *
 *         Flow: GenLayer IC → BridgeSender.py → Relay Service → VerdictRegistry
 */
contract VerdictRegistry is IGenLayerBridgeReceiver, Ownable {
    struct Verdict {
        string agreementId;
        uint256 milestoneIndex;
        string verdict;         // "client" | "provider" | "undetermined"
        bytes32 reasoningHash;  // keccak256 of reasoning text
        uint256 timestamp;
        bool exists;
    }

    /// @notice Bridge receiver (relay wallet) that delivers verdict messages
    address public bridgeReceiver;

    /// @notice Verdicts indexed by keccak256(agreementId, milestoneIndex)
    mapping(bytes32 => Verdict) public verdicts;

    /// @notice All verdict keys for enumeration
    bytes32[] public verdictKeys;

    /// @notice Agreement IDs that have been recorded
    mapping(string => bool) public knownAgreements;
    string[] public agreementIds;

    event VerdictRecorded(
        string indexed agreementId,
        uint256 milestoneIndex,
        string verdict,
        bytes32 reasoningHash,
        uint32 sourceChainId
    );

    event BridgeReceiverUpdated(address indexed oldReceiver, address indexed newReceiver);

    constructor(address _bridgeReceiver) Ownable(msg.sender) {
        require(_bridgeReceiver != address(0), "VerdictRegistry: _bridgeReceiver=0");
        bridgeReceiver = _bridgeReceiver;
    }

    function setBridgeReceiver(address _bridgeReceiver) external onlyOwner {
        require(_bridgeReceiver != address(0), "VerdictRegistry: _bridgeReceiver=0");
        emit BridgeReceiverUpdated(bridgeReceiver, _bridgeReceiver);
        bridgeReceiver = _bridgeReceiver;
    }

    /// @notice Called by BridgeReceiver when a verdict arrives from GenLayer
    function processBridgeMessage(
        uint32 _sourceChainId,
        address,
        bytes calldata _message
    ) external {
        require(msg.sender == bridgeReceiver, "VerdictRegistry: only bridge receiver");

        // Decode verdict data
        (
            string memory agreementId,
            uint256 milestoneIndex,
            string memory verdictStr,
            bytes32 reasoningHash
        ) = abi.decode(_message, (string, uint256, string, bytes32));

        bytes32 key = keccak256(abi.encodePacked(agreementId, milestoneIndex));

        verdicts[key] = Verdict({
            agreementId: agreementId,
            milestoneIndex: milestoneIndex,
            verdict: verdictStr,
            reasoningHash: reasoningHash,
            timestamp: block.timestamp,
            exists: true
        });

        verdictKeys.push(key);

        // Track agreement ID
        if (!knownAgreements[agreementId]) {
            knownAgreements[agreementId] = true;
            agreementIds.push(agreementId);
        }

        emit VerdictRecorded(agreementId, milestoneIndex, verdictStr, reasoningHash, _sourceChainId);
    }

    // --- Views ---

    function getVerdict(string calldata agreementId, uint256 milestoneIndex)
        external view returns (Verdict memory)
    {
        bytes32 key = keccak256(abi.encodePacked(agreementId, milestoneIndex));
        return verdicts[key];
    }

    function hasVerdict(string calldata agreementId, uint256 milestoneIndex)
        external view returns (bool)
    {
        bytes32 key = keccak256(abi.encodePacked(agreementId, milestoneIndex));
        return verdicts[key].exists;
    }

    function getVerdictCount() external view returns (uint256) {
        return verdictKeys.length;
    }

    function getAgreementCount() external view returns (uint256) {
        return agreementIds.length;
    }
}
